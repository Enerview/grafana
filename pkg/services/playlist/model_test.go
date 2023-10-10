package playlist

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPlaylistConversion(t *testing.T) {
	src := &PlaylistDTO{
		OrgID:     3,
		Uid:       "abc",
		Name:      "MyPlaylists",
		Interval:  "10s",
		CreatedAt: 12345,
		UpdatedAt: 54321,
		Items: []PlaylistItemDTO{
			{Type: "dashboard_by_uid", Value: "UID0"},
			{Type: "dashboard_by_tag", Value: "tagA"},
			{Type: "dashboard_by_id", Value: "123"}, // deprecated
		},
	}
	dst := ConvertToK8sResource(src)

	require.Equal(t, "abc", src.Uid)
	require.Equal(t, "abc", dst.Name)
	require.Equal(t, src.Name, dst.Spec.Name)

	out, err := json.MarshalIndent(dst, "", "  ")
	require.NoError(t, err)
	//fmt.Printf("%s", string(out))
	require.JSONEq(t, `{
		"kind": "Playlist",
		"apiVersion": "playlists.grafana.com/v0alpha1",
		"metadata": {
		  "name": "abc",
		  "namespace": "org-3",
		  "uid": "abc",
		  "resourceVersion": "54321",
		  "creationTimestamp": "1970-01-01T00:00:12Z"
		},
		"spec": {
		  "interval": "10s",
		  "items": [
			{
			  "type": "dashboard_by_uid",
			  "value": "UID0"
			},
			{
			  "type": "dashboard_by_tag",
			  "value": "tagA"
			},
			{
			  "type": "dashboard_by_id",
			  "value": "123"
			}
		  ],
		  "name": "MyPlaylists",
		  "uid": "abc"
		}
	  }`, string(out))
}
