package extsvcaccounts

import (
	"github.com/grafana/grafana/pkg/models/roletype"
	ac "github.com/grafana/grafana/pkg/services/accesscontrol"
)

const (
	skvType  = "extsvc-token"
	TmpOrgID = 1
)

type saveExtSvcAccountCmd struct {
	ExtSvcSlug  string
	OrgID       int64
	Permissions []ac.Permission
	SaID        int64
	WithToken   bool
}

func newRole(r roletype.RoleType) *roletype.RoleType {
	return &r
}

func newBool(b bool) *bool {
	return &b
}
