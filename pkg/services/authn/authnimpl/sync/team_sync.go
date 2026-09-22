package sync

import (
	"context"
	"errors"
	"strconv"

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

var errDefaultTeamNotFound = errors.New("configured default team not found in organization")

// teamSyncPermissions is what the sync needs to look up the configured team.
// Team search is access controlled and a post auth hook has no signed in user
// to inherit permissions from, so we use a background user instead.
var teamSyncPermissions = []accesscontrol.Permission{
	{Action: accesscontrol.ActionTeamsRead, Scope: accesscontrol.ScopeTeamsAll},
}

func ProvideTeamSync(
	teamService team.Service, teamPermissionsService accesscontrol.TeamPermissionsService,
	userService user.Service, socialService social.Service, tracer tracing.Tracer,
) *TeamSync {
	return &TeamSync{teamService, teamPermissionsService, userService, socialService, log.New("team.sync"), tracer}
}

type TeamSync struct {
	teamService            team.Service
	teamPermissionsService accesscontrol.TeamPermissionsService
	userService            user.Service
	socialService          social.Service
	log                    log.Logger
	tracer                 tracing.Tracer
}

// SyncDefaultTeamHook adds the user to the team configured as `default_team` for
// the OAuth provider they authenticated with. Grafana's group based team sync is
// an enterprise feature; this covers the much narrower case of a provider that
// maps to exactly one team.
//
// The hook runs on every login and is idempotent: existing members are left
// alone, so a user promoted to team admin keeps that role. It never fails a
// login - a team that is missing or misspelled is logged and the user signs in
// without the membership.
func (s *TeamSync) SyncDefaultTeamHook(ctx context.Context, id *authn.Identity, r *authn.Request) error {
	ctx, span := s.tracer.Start(ctx, "team.sync.SyncDefaultTeamHook")
	defer span.End()

	if !id.ClientParams.SyncTeams {
		return nil
	}

	if !id.IsIdentityType(claims.TypeUser) {
		return nil
	}

	// Returns nil for anything that is not an OAuth provider, which is how
	// basic auth, LDAP and JWT identities fall out of this hook.
	info := s.socialService.GetOAuthInfoProvider(id.GetAuthenticatedBy())
	if info == nil || info.DefaultTeam == "" {
		return nil
	}

	ctxLogger := s.log.FromContext(ctx).New("id", id.ID, "login", id.Login, "team", info.DefaultTeam)

	userID, err := id.GetInternalID()
	if err != nil {
		ctxLogger.Warn("Failed to sync default team, invalid ID for identity", "type", id.GetIdentityType(), "error", err)
		return nil
	}

	orgID, err := s.resolveOrg(ctx, id, r, userID)
	if err != nil {
		ctxLogger.Error("Failed to sync default team, could not resolve organization", "error", err)
		return nil
	}

	teamID, err := s.resolveTeam(ctx, orgID, info.DefaultTeam)
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

// resolveOrg returns the org the team membership should be created in. The
// identity only carries an org id once org sync has mapped roles for it, and
// the org is otherwise resolved later in the hook chain by FetchSyncedUserHook.
// Falling back to the same lookup keeps this hook ahead of the permission sync
// so a new membership takes effect on the login that created it.
func (s *TeamSync) resolveOrg(ctx context.Context, id *authn.Identity, r *authn.Request, userID int64) (int64, error) {
	if id.OrgID > 0 {
		return id.OrgID, nil
	}

	usr, err := s.userService.GetSignedInUser(ctx, &user.GetSignedInUserQuery{UserID: userID, OrgID: r.OrgID})
	if err != nil {
		return 0, err
	}

	if usr.OrgID <= 0 {
		return 0, errors.New("identity is not assigned to an organization")
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
