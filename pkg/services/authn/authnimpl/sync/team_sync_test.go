package sync

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	claims "github.com/grafana/authlib/types"
	"github.com/grafana/grafana/pkg/infra/tracing"
	"github.com/grafana/grafana/pkg/login/social"
	"github.com/grafana/grafana/pkg/login/social/socialtest"
	"github.com/grafana/grafana/pkg/services/accesscontrol"
	acmock "github.com/grafana/grafana/pkg/services/accesscontrol/mock"
	"github.com/grafana/grafana/pkg/services/authn"
	"github.com/grafana/grafana/pkg/services/login"
	"github.com/grafana/grafana/pkg/services/org"
	"github.com/grafana/grafana/pkg/services/org/orgtest"
	"github.com/grafana/grafana/pkg/services/team"
	"github.com/grafana/grafana/pkg/services/team/teamtest"
	"github.com/grafana/grafana/pkg/services/user"
	"github.com/grafana/grafana/pkg/services/user/usertest"
)

// recordingTeamService captures the name the hook searched for, so the
// precedence between the provider and the global setting can be asserted.
type recordingTeamService struct {
	*teamtest.FakeService
	searchedName string
}

func (s *recordingTeamService) SearchTeams(ctx context.Context, q *team.SearchTeamsQuery) (team.SearchTeamQueryResult, error) {
	s.searchedName = q.Name
	return s.FakeService.SearchTeams(ctx, q)
}

func TestTeamSync_SyncDefaultTeamHook(t *testing.T) {
	found := team.SearchTeamQueryResult{
		Teams: []*team.TeamDTO{{ID: 7, OrgID: 1, Name: "Continental"}},
	}

	type testCase struct {
		desc string

		identity    *authn.Identity
		request     *authn.Request
		oauthInfo   *social.OAuthInfo
		globalTeam  string
		searchTeams team.SearchTeamQueryResult
		userOrgs    []int64 // orgs the user is a member of; nil means just org 1
		defaultOrg  int64   // the user's default org; defaults to 1
		isMember    bool
		teamErr     error
		orgErr      error
		userErr     error
		setErr      error

		expectedAdd  bool
		expectedTeam string
		expectedOrg  int64 // org the membership must be created in; defaults to 1
	}

	tests := []testCase{
		{
			desc:         "should add an oauth user to the team configured on the provider",
			identity:     loginIdentity(login.AzureADAuthModule),
			oauthInfo:    &social.OAuthInfo{DefaultTeam: "Continental"},
			searchTeams:  found,
			expectedAdd:  true,
			expectedTeam: "Continental",
		},
		{
			desc:         "should fall back to the global team when the provider has none",
			identity:     loginIdentity(login.AzureADAuthModule),
			oauthInfo:    &social.OAuthInfo{},
			globalTeam:   "Everyone",
			searchTeams:  found,
			expectedAdd:  true,
			expectedTeam: "Everyone",
		},
		{
			desc:         "should prefer the provider team over the global one",
			identity:     loginIdentity(login.AzureADAuthModule),
			oauthInfo:    &social.OAuthInfo{DefaultTeam: "Continental"},
			globalTeam:   "Everyone",
			searchTeams:  found,
			expectedAdd:  true,
			expectedTeam: "Continental",
		},
		{
			desc:         "should add a native password login to the global team",
			identity:     loginIdentity(login.PasswordAuthModule),
			globalTeam:   "Everyone",
			searchTeams:  found,
			expectedAdd:  true,
			expectedTeam: "Everyone",
		},
		{
			desc:         "should add an ldap login to the global team",
			identity:     loginIdentity(login.LDAPAuthModule),
			globalTeam:   "Everyone",
			searchTeams:  found,
			expectedAdd:  true,
			expectedTeam: "Everyone",
		},
		{
			// Env vars are not trimmed by the ini loader, and values saved
			// through the SSO settings API are stored verbatim.
			desc:         "should ignore surrounding whitespace in the configured team names",
			identity:     loginIdentity(login.AzureADAuthModule),
			oauthInfo:    &social.OAuthInfo{DefaultTeam: " Continental\n"},
			searchTeams:  found,
			expectedAdd:  true,
			expectedTeam: "Continental",
		},
		{
			desc:         "should treat a whitespace only provider team as unset",
			identity:     loginIdentity(login.AzureADAuthModule),
			oauthInfo:    &social.OAuthInfo{DefaultTeam: "  "},
			globalTeam:   " Everyone ",
			searchTeams:  found,
			expectedAdd:  true,
			expectedTeam: "Everyone",
		},
		{
			// The oauth client does not set an org on the identity, and org sync
			// only fills one in when the provider maps org roles.
			desc:         "should use the user's default org when the identity has none",
			identity:     identityWithoutOrg(login.AzureADAuthModule),
			oauthInfo:    &social.OAuthInfo{DefaultTeam: "Continental"},
			searchTeams:  found,
			userOrgs:     []int64{1, 3},
			defaultOrg:   3,
			expectedAdd:  true,
			expectedTeam: "Continental",
			expectedOrg:  3,
		},
		{
			// Password logins take the identity's org from the orgId parameter
			// or X-Grafana-Org-Id header of the login request.
			desc:         "should not trust an identity org the user is not a member of",
			identity:     identityInOrg(login.PasswordAuthModule, 5),
			globalTeam:   "Everyone",
			searchTeams:  found,
			userOrgs:     []int64{1},
			defaultOrg:   1,
			expectedAdd:  true,
			expectedTeam: "Everyone",
			expectedOrg:  1,
		},
		{
			desc:        "should not fail login when the user belongs to no organization",
			identity:    identityInOrg(login.PasswordAuthModule, 5),
			globalTeam:  "Everyone",
			searchTeams: found,
			userOrgs:    []int64{},
			expectedAdd: false,
		},
		{
			desc:        "should not fail login when the org membership lookup errors",
			identity:    loginIdentity(login.AzureADAuthModule),
			oauthInfo:   &social.OAuthInfo{DefaultTeam: "Continental"},
			searchTeams: found,
			orgErr:      errors.New("db is down"),
			expectedAdd: false,
		},
		{
			desc:        "should not fail login when the default org lookup errors",
			identity:    identityWithoutOrg(login.AzureADAuthModule),
			oauthInfo:   &social.OAuthInfo{DefaultTeam: "Continental"},
			searchTeams: found,
			userErr:     errors.New("db is down"),
			expectedAdd: false,
		},
		{
			// Session cookies and basic auth re-run the post auth hooks on every
			// request; only Login() sets the marker.
			desc:        "should be a no-op for requests that are not a login",
			identity:    loginIdentity(login.AzureADAuthModule),
			request:     &authn.Request{HTTPRequest: httptest.NewRequest(http.MethodGet, "/", nil)},
			oauthInfo:   &social.OAuthInfo{DefaultTeam: "Continental"},
			globalTeam:  "Everyone",
			searchTeams: found,
			expectedAdd: false,
		},
		{
			// ResolveIdentity and SyncIdentity set the login marker on requests
			// they build themselves.
			desc:        "should be a no-op for a synthetic login without an http request",
			identity:    loginIdentity(login.LDAPAuthModule),
			request:     syntheticLoginRequest(),
			globalTeam:  "Everyone",
			searchTeams: found,
			expectedAdd: false,
		},
		{
			desc:        "should be a no-op when no default team is configured anywhere",
			identity:    loginIdentity(login.AzureADAuthModule),
			oauthInfo:   &social.OAuthInfo{},
			searchTeams: found,
			expectedAdd: false,
		},
		{
			desc:        "should be a no-op for a service account",
			identity:    &authn.Identity{ID: "1", Type: claims.TypeServiceAccount, OrgID: 1, AuthenticatedBy: login.AzureADAuthModule},
			globalTeam:  "Everyone",
			searchTeams: found,
			expectedAdd: false,
		},
		{
			desc:        "should be a no-op when the user is already a member",
			identity:    loginIdentity(login.AzureADAuthModule),
			oauthInfo:   &social.OAuthInfo{DefaultTeam: "Continental"},
			searchTeams: found,
			isMember:    true,
			expectedAdd: false,
		},
		{
			desc:        "should not fail login when the configured team does not exist",
			identity:    loginIdentity(login.AzureADAuthModule),
			oauthInfo:   &social.OAuthInfo{DefaultTeam: "Nonexistent"},
			searchTeams: team.SearchTeamQueryResult{},
			expectedAdd: false,
		},
		{
			desc:        "should not fail login when the team lookup errors",
			identity:    loginIdentity(login.AzureADAuthModule),
			oauthInfo:   &social.OAuthInfo{DefaultTeam: "Continental"},
			searchTeams: found,
			teamErr:     errors.New("db is down"),
			expectedAdd: false,
		},
		{
			desc:         "should not fail login when adding the member errors",
			identity:     loginIdentity(login.AzureADAuthModule),
			oauthInfo:    &social.OAuthInfo{DefaultTeam: "Continental"},
			searchTeams:  found,
			setErr:       errors.New("boom"),
			expectedAdd:  true,
			expectedTeam: "Continental",
		},
	}

	for _, tt := range tests {
		t.Run(tt.desc, func(t *testing.T) {
			teamService := &recordingTeamService{FakeService: &teamtest.FakeService{
				ExpectedSearchTeamsResult: tt.searchTeams,
				ExpectedIsMember:          tt.isMember,
				ExpectedError:             tt.teamErr,
			}}

			userOrgs := tt.userOrgs
			if userOrgs == nil {
				userOrgs = []int64{1}
			}
			orgDTOs := make([]*org.UserOrgDTO, 0, len(userOrgs))
			for _, orgID := range userOrgs {
				orgDTOs = append(orgDTOs, &org.UserOrgDTO{OrgID: orgID})
			}

			defaultOrg := tt.defaultOrg
			if defaultOrg == 0 {
				defaultOrg = 1
			}

			expectedOrg := tt.expectedOrg
			if expectedOrg == 0 {
				expectedOrg = 1
			}

			permissions := acmock.NewMockedPermissionsService()
			if tt.expectedAdd {
				permissions.On("SetUserPermission", mock.Anything, expectedOrg, accesscontrol.User{ID: 1},
					"7", team.PermissionTypeMember.String()).
					Return(&accesscontrol.ResourcePermission{}, tt.setErr).Once()
			}

			s := ProvideTeamSync(
				teamService,
				permissions,
				&usertest.FakeUserService{ExpectedUser: &user.User{ID: 1, OrgID: defaultOrg}, ExpectedError: tt.userErr},
				&orgtest.FakeOrgService{ExpectedUserOrgDTO: orgDTOs, ExpectedError: tt.orgErr},
				&socialtest.FakeSocialService{ExpectedAuthInfoProvider: tt.oauthInfo},
				tt.globalTeam,
				tracing.InitializeTracerForTest(),
			)

			r := tt.request
			if r == nil {
				r = loginRequest()
			}

			// The hook must never fail a login.
			require.NoError(t, s.SyncDefaultTeamHook(context.Background(), tt.identity, r))
			permissions.AssertExpectations(t)
			if tt.expectedTeam != "" {
				assert.Equal(t, tt.expectedTeam, teamService.searchedName, "looked up the wrong team")
			}
		})
	}
}

func loginRequest() *authn.Request {
	r := &authn.Request{HTTPRequest: httptest.NewRequest(http.MethodPost, "/login", nil)}
	r.SetMeta(authn.MetaKeyIsLogin, "true")
	return r
}

func syntheticLoginRequest() *authn.Request {
	r := &authn.Request{}
	r.SetMeta(authn.MetaKeyIsLogin, "true")
	return r
}

func loginIdentity(authenticatedBy string) *authn.Identity {
	return identityInOrg(authenticatedBy, 1)
}

func identityInOrg(authenticatedBy string, orgID int64) *authn.Identity {
	id := identityWithoutOrg(authenticatedBy)
	id.OrgID = orgID
	return id
}

func identityWithoutOrg(authenticatedBy string) *authn.Identity {
	return &authn.Identity{
		ID:              "1",
		Type:            claims.TypeUser,
		AuthenticatedBy: authenticatedBy,
	}
}
