# Workspace activity

Workspace activity is a read-only timeline for collaboration context. Any current Workspace member, including a viewer, can read it; access is checked against membership on every request. Removing a member immediately removes timeline access.

The timeline records content creation, rename, move, trash / restore, comments added / deleted, manual history checkpoints, automatic content checkpoints, and read-only share create / publish / revoke operations. Automatic checkpoints by the same member on the same Item coalesce within the existing 15-minute checkpoint window.

Records contain the Item title snapshot, actor display-name snapshot, action summary and time. They never contain document text or comment bodies. Records are created in the same database transaction as their action, so the action rolls back if its audit record cannot be saved. Hard-purged Item events remain as title snapshots until the Workspace itself is deleted; they cannot be used to access content. There is no automatic retention cleanup.

The API is `GET /api/workspaces/{workspaceId}/activity`, with optional `before` cursor and `limit` (default 30, maximum 100). The response is `{ events, nextBefore }`, newest first. The UI exposes the same feed from the Workspace top bar and Workspace menu.
