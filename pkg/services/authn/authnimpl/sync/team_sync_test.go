package sync

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	claims "github.com/grafana/authlib/types"
	"github.com/grafana/grafana/pkg/infra/tracing"
	"github.com/grafana/grafana/pkg/login/social"
	"github.com/grafana/grafana/pkg/login/social/socialtest"
	"github.com/grafana/grafana/pkg/services/accesscontrol"
	acmock "github.com/grafana/grafana/pkg/services/accesscontrol/mock"
	"github.com/grafana/grafana/pkg/services/authn"
	"github.com/grafana/grafana/pkg/services/team"
	"github.com/grafana/grafana/pkg/services/team/teamtest"
	"github.com/grafana/grafana/pkg/services/user"
	"github.com/grafana/grafana/pkg/services/user/usertest"
)

func TestTeamSync_SyncDefaultTeamHook(t *testing.T) {
	continental := team.SearchTeamQueryResult{
		Teams: []*team.TeamDTO{{ID: 7, OrgID: 1, Name: "Continental"}},
	}

	type testCase struct {
		desc string

		identity    *authn.Identity
		oauthInfo   *social.OAuthInfo
		searchTeams team.SearchTeamQueryResult
		signedIn    *user.SignedInUser
		isMember    bool
		teamErr     error
		userErr     error
		setErr      error

		expectedAdd bool
		expectedOrg int64 // org the membership must be created in; defaults to 1
	}

	tests := []testCase{
		{
			desc:        "should add an oauth user to the configured default team",
			identity:    oauthIdentity("oauth_azuread"),
			oauthInfo:   &social.OAuthInfo{DefaultTeam: "Continental"},
			searchTeams: continental,
			expectedAdd: true,
		},
		{
			// The oauth client does not set an org on the identity, and org sync
			// only fills one in when the provider maps org roles.
			desc:        "should resolve the org from the user when the identity has none",
			identity:    identityWithoutOrg("oauth_azuread"),
			oauthInfo:   &social.OAuthInfo{DefaultTeam: "Continental"},
			searchTeams: continental,
			signedIn:    &user.SignedInUser{UserID: 1, OrgID: 3},
			expectedAdd: true,
			expectedOrg: 3,
		},
		{
			desc:        "should be a no-op when the user is already a member",
			identity:    oauthIdentity("oauth_azuread"),
			oauthInfo:   &social.OAuthInfo{DefaultTeam: "Continental"},
			searchTeams: continental,
			isMember:    true,
			expectedAdd: false,
		},
		{
			desc:        "should be a no-op when the provider has no default team configured",
			identity:    oauthIdentity("oauth_azuread"),
			oauthInfo:   &social.OAuthInfo{},
			searchTeams: continental,
			expectedAdd: false,
		},
		{
			desc:        "should be a no-op for identities that are not oauth",
			identity:    oauthIdentity("ldap"),
			oauthInfo:   nil,
			searchTeams: continental,
			expectedAdd: false,
		},
		{
			desc: "should be a no-op when the client does not request team sync",
			identity: &authn.Identity{
				ID: "1", Type: claims.TypeUser, OrgID: 1, AuthenticatedBy: "oauth_azuread",
				ClientParams: authn.ClientParams{SyncTeams: false},
			},
			oauthInfo:   &social.OAuthInfo{DefaultTeam: "Continental"},
			searchTeams: continental,
			expectedAdd: false,
		},
		{
			desc:        "should not fail login when the user has no organization",
			identity:    identityWithoutOrg("oauth_azuread"),
			oauthInfo:   &social.OAuthInfo{DefaultTeam: "Continental"},
			searchTeams: continental,
			signedIn:    &user.SignedInUser{UserID: 1},
			expectedAdd: false,
		},
		{
			desc:        "should not fail login when the org lookup errors",
			identity:    identityWithoutOrg("oauth_azuread"),
			oauthInfo:   &social.OAuthInfo{DefaultTeam: "Continental"},
			searchTeams: continental,
			userErr:     errors.New("db is down"),
			expectedAdd: false,
		},
		{
			desc:        "should not fail login when the configured team does not exist",
			identity:    oauthIdentity("oauth_azuread"),
			oauthInfo:   &social.OAuthInfo{DefaultTeam: "Nonexistent"},
			searchTeams: team.SearchTeamQueryResult{},
			expectedAdd: false,
		},
		{
			desc:        "should not fail login when the team lookup errors",
			identity:    oauthIdentity("oauth_azuread"),
			oauthInfo:   &social.OAuthInfo{DefaultTeam: "Continental"},
			searchTeams: continental,
			teamErr:     errors.New("db is down"),
			expectedAdd: false,
		},
		{
			desc:        "should not fail login when adding the member errors",
			identity:    oauthIdentity("oauth_azuread"),
			oauthInfo:   &social.OAuthInfo{DefaultTeam: "Continental"},
			searchTeams: continental,
			setErr:      errors.New("boom"),
			expectedAdd: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.desc, func(t *testing.T) {
			teamService := &teamtest.FakeService{
				ExpectedSearchTeamsResult: tt.searchTeams,
				ExpectedIsMember:          tt.isMember,
				ExpectedError:             tt.teamErr,
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
				&usertest.FakeUserService{ExpectedSignedInUser: tt.signedIn, ExpectedError: tt.userErr},
				&socialtest.FakeSocialService{ExpectedAuthInfoProvider: tt.oauthInfo},
				tracing.InitializeTracerForTest(),
			)

			// The hook must never fail a login.
			require.NoError(t, s.SyncDefaultTeamHook(context.Background(), tt.identity, &authn.Request{}))
			permissions.AssertExpectations(t)
		})
	}
}

func oauthIdentity(authenticatedBy string) *authn.Identity {
	id := identityWithoutOrg(authenticatedBy)
	id.OrgID = 1
	return id
}

func identityWithoutOrg(authenticatedBy string) *authn.Identity {
	return &authn.Identity{
		ID:              "1",
		Type:            claims.TypeUser,
		AuthenticatedBy: authenticatedBy,
		ClientParams:    authn.ClientParams{SyncTeams: true},
	}
}
