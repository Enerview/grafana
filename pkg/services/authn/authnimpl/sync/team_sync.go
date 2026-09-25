package sync

import (
	"context"
	"errors"
	"slices"
	"strconv"
	"strings"

	claims "github.com/grafana/authlib/types"
	"github.com/grafana/grafana/pkg/infra/log"
	"github.com/grafana/grafana/pkg/infra/tracing"
	"github.com/grafana/grafana/pkg/login/social"
	"github.com/grafana/grafana/pkg/services/accesscontrol"
	"github.com/grafana/grafana/pkg/services/authn"
	"github.com/grafana/grafana/pkg/services/org"
	"github.com/grafana/grafana/pkg/services/team"
	"github.com/grafana/grafana/pkg/services/user"
)

var (
	errDefaultTeamNotFound = errors.New("configured default team not found in organization")
	errNotOrgMember        = errors.New("user is not a member of the organization")
)

// teamSyncPermissions is what the sync needs to look up the configured team.
// Team search is access controlled and a post auth hook has no signed in user
// to inherit permissions from, so we use a background user instead.
var teamSyncPermissions = []accesscontrol.Permission{
	{Action: accesscontrol.ActionTeamsRead, Scope: accesscontrol.ScopeTeamsAll},
}

func ProvideTeamSync(
	teamService team.Service, teamPermissionsService accesscontrol.TeamPermissionsService,
	userService user.Service, orgService org.Service, socialService social.Service, defaultTeam string,
	tracer tracing.Tracer,
) *TeamSync {
	return &TeamSync{
		teamService, teamPermissionsService, userService, orgService, socialService,
		strings.TrimSpace(defaultTeam), log.New("team.sync"), tracer,
	}
}

type TeamSync struct {
	teamService            team.Service
	teamPermissionsService accesscontrol.TeamPermissionsService
	userService            user.Service
	orgService             org.Service
	socialService          social.Service
	defaultTeam            string
	log                    log.Logger
	tracer                 tracing.Tracer
}

// SyncDefaultTeamHook adds the user to a configured default team on login. The
// team comes from the OAuth provider they authenticated with, falling back to
// the global `[users] default_team`. Grafana's group based team sync is an
// enterprise feature; this covers the much narrower case of a provider - or a
// whole instance - that maps to exactly one team.
//
// The hook runs on every login and is idempotent: existing members are left
// alone, so a user promoted to team admin keeps that role. It never fails a
// login - a team that is missing or misspelled is logged and the user signs in
// without the membership.
func (s *TeamSync) SyncDefaultTeamHook(ctx context.Context, id *authn.Identity, r *authn.Request) error {
	ctx, span := s.tracer.Start(ctx, "team.sync.SyncDefaultTeamHook")
	defer span.End()

	// Only interactive logins. Session cookies and basic auth re-run the post
	// auth hooks on every request with the same client params as a password
	// login, so the login marker is what separates them. ResolveIdentity and
	// SyncIdentity also set the marker, but on synthetic requests without an
	// HTTP request, which Login always has.
	if r.GetMeta(authn.MetaKeyIsLogin) == "" || r.HTTPRequest == nil {
		return nil
	}

	if !id.IsIdentityType(claims.TypeUser) {
		return nil
	}

	teamName := s.resolveTeamName(id)
	if teamName == "" {
		return nil
	}

	ctxLogger := s.log.FromContext(ctx).New("id", id.ID, "login", id.Login, "team", teamName)

	userID, err := id.GetInternalID()
	if err != nil {
		ctxLogger.Warn("Failed to sync default team, invalid ID for identity", "type", id.GetIdentityType(), "error", err)
		return nil
	}

	orgID, err := s.resolveOrg(ctx, id, userID)
	if err != nil {
		ctxLogger.Warn("Failed to sync default team, could not resolve organization", "orgId", id.OrgID, "error", err)
		return nil
	}

	teamID, err := s.resolveTeam(ctx, orgID, teamName)
	if err != nil {
		ctxLogger.Warn("Failed to sync default team", "orgId", orgID, "error", err)
		return nil
	}

	isMember, err := s.teamService.IsTeamMember(ctx, orgID, teamID, userID)
	if err != nil {
		ctxLogger.Error("Failed to check default team membership", "orgId", orgID, "teamId", teamID, "error", err)
		return nil
	}

	if isMember {
		return nil
	}

	if _, err := s.teamPermissionsService.SetUserPermission(ctx, orgID, accesscontrol.User{ID: userID},
		strconv.FormatInt(teamID, 10), team.PermissionTypeMember.String()); err != nil {
		ctxLogger.Error("Failed to add user to default team", "orgId", orgID, "teamId", teamID, "error", err)
		return nil
	}

	ctxLogger.Debug("Added user to default team", "orgId", orgID, "teamId", teamID)
	return nil
}

// resolveTeamName returns the team the identity should be added to. A team
// configured on the OAuth provider replaces the global one rather than adding
// to it, so a login only ever results in a single default membership.
func (s *TeamSync) resolveTeamName(id *authn.Identity) string {
	// Returns nil for anything that is not an OAuth provider, which is how
	// password and LDAP logins fall through to the global setting.
	if info := s.socialService.GetOAuthInfoProvider(id.GetAuthenticatedBy()); info != nil {
		if name := strings.TrimSpace(info.DefaultTeam); name != "" {
			return name
		}
	}

	return s.defaultTeam
}

// resolveOrg returns the org the team membership should be created in: the
// identity's org if the user belongs to it, otherwise the user's default org.
// Membership must be checked here because password and LDAP logins take the
// identity's org straight from the request's orgId parameter or
// X-Grafana-Org-Id header, and adding a team member does not verify it.
//
// GetSignedInUser is avoided on purpose: it caches the user and their team ids
// for a few seconds, so FetchSyncedUserHook could build the login's identity
// from a copy taken before the new membership existed.
func (s *TeamSync) resolveOrg(ctx context.Context, id *authn.Identity, userID int64) (int64, error) {
	orgs, err := s.orgService.GetUserOrgList(ctx, &org.GetUserOrgListQuery{UserID: userID})
	if err != nil {
		return 0, err
	}

	isMember := func(orgID int64) bool {
		return slices.ContainsFunc(orgs, func(o *org.UserOrgDTO) bool { return o.OrgID == orgID })
	}

	if id.OrgID > 0 && isMember(id.OrgID) {
		return id.OrgID, nil
	}

	usr, err := s.userService.GetByID(ctx, &user.GetUserByIDQuery{ID: userID})
	if err != nil {
		return 0, err
	}

	if !isMember(usr.OrgID) {
		return 0, errNotOrgMember
	}

	return usr.OrgID, nil
}

func (s *TeamSync) resolveTeam(ctx context.Context, orgID int64, name string) (int64, error) {
	res, err := s.teamService.SearchTeams(ctx, &team.SearchTeamsQuery{
		OrgID:        orgID,
		Name:         name,
		Limit:        1,
		Page:         1,
		SignedInUser: accesscontrol.BackgroundUser("team_sync", orgID, org.RoleAdmin, teamSyncPermissions),
	})
	if err != nil {
		return 0, err
	}

	if len(res.Teams) == 0 {
		return 0, errDefaultTeamNotFound
	}

	return res.Teams[0].ID, nil
}
