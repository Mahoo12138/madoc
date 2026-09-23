package core

import (
	"encoding/hex"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
)

const MaxImportEntries = 5000
const MaxImportContentBytes int64 = 512 << 20

// IDs are fresh destination UUIDs, allocated before compiling Markdown links and
// Yjs snapshots. They are never used to update existing content.
type ImportItem struct {
	ID         string           `json:"id"`
	ParentID   *string          `json:"parentId"`
	Type       string           `json:"type"`
	Title      string           `json:"title"`
	Markdown   *InitialMarkdown `json:"markdown,omitempty"`
	Whiteboard *string          `json:"whiteboard,omitempty"`
}

// ImportAsset is trusted metadata from server-side file inspection, not a client
// assertion that a file exists. The file-storage coordinator must ensure all
// payloads are durable before calling ImportContent, and handle rollback cleanup.
type ImportAsset struct {
	StorageKey string `json:"-"`
	ID         string `json:"id"`
	ItemID     string `json:"itemId"`
	FileName   string `json:"fileName"`
	MIME       string `json:"mime"`
	Size       int64  `json:"size"`
	SHA256     string `json:"sha256"`
}

// ValidateContentImport checks a plan before the file coordinator stages payloads.
func ValidateContentImport(plan ContentImport) error {
	_, err := validateImport(plan)
	return err
}

type ContentImport struct {
	ID       string        `json:"id"`
	ParentID *string       `json:"parentId"`
	Items    []ImportItem  `json:"items"`
	Assets   []ImportAsset `json:"assets"`
}

type ImportResult struct {
	RootID          string `json:"rootId"`
	ItemCount       int    `json:"itemCount"`
	AttachmentCount int    `json:"attachmentCount"`
	Replayed        bool   `json:"replayed"`
}

func validImportID(id string) bool {
	parsed, err := uuid.Parse(id)
	return err == nil && parsed != uuid.Nil && parsed.String() == id
}

// validateImport returns parent-first order without changing the request used by
// the replay digest. Siblings keep their request order even with unordered input.
func validateImport(plan ContentImport) ([]ImportItem, error) {
	if !validImportID(plan.ID) || len(plan.Items) == 0 || len(plan.Items)+len(plan.Assets) > MaxImportEntries {
		return nil, ErrInvalid
	}
	byID := make(map[string]ImportItem, len(plan.Items))
	children := make(map[string][]string)
	rootID := ""
	var size int64
	for _, item := range plan.Items {
		if !validImportID(item.ID) || strings.TrimSpace(item.Title) == "" || !utf8.ValidString(item.Title) {
			return nil, ErrInvalid
		}
		if _, exists := byID[item.ID]; exists {
			return nil, ErrInvalid
		}
		byID[item.ID] = item
		if item.ParentID == nil {
			if rootID != "" {
				return nil, ErrInvalid
			}
			rootID = item.ID
		} else {
			children[*item.ParentID] = append(children[*item.ParentID], item.ID)
		}
		switch item.Type {
		case "folder":
			if item.Markdown != nil || item.Whiteboard != nil {
				return nil, ErrInvalid
			}
		case "markdown":
			if item.Markdown == nil || len(item.Markdown.Snapshot) == 0 || item.Whiteboard != nil || !utf8.ValidString(item.Markdown.Markdown) {
				return nil, ErrInvalid
			}
			size += int64(len(item.Markdown.Snapshot)) + int64(len(item.Markdown.Markdown))
		case "whiteboard":
			if item.Whiteboard == nil || item.Markdown != nil {
				return nil, ErrInvalid
			}
			size += int64(len(*item.Whiteboard))
		default:
			return nil, ErrInvalid
		}
		if size > MaxImportContentBytes {
			return nil, ErrInvalid
		}
	}
	if rootID == "" {
		return nil, ErrInvalid
	}
	for _, item := range plan.Items {
		if item.ParentID != nil {
			parent, exists := byID[*item.ParentID]
			if !exists || parent.Type != "folder" {
				return nil, ErrInvalid
			}
		}
		if item.Whiteboard != nil && (!utf8.ValidString(*item.Whiteboard) || !validInitialWhiteboardScene(*item.Whiteboard)) {
			return nil, ErrInvalid
		}
	}
	order := make([]ImportItem, 0, len(plan.Items))
	pending := []string{rootID}
	visited := make(map[string]bool, len(plan.Items))
	for len(pending) > 0 {
		id := pending[0]
		pending = pending[1:]
		if visited[id] {
			return nil, ErrInvalid
		}
		visited[id] = true
		order = append(order, byID[id])
		pending = append(pending, children[id]...)
	}
	if len(order) != len(plan.Items) {
		return nil, ErrInvalid
	}
	assets := make(map[string]bool, len(plan.Assets))
	for _, asset := range plan.Assets {
		if !validImportID(asset.ID) || assets[asset.ID] {
			return nil, ErrInvalid
		}
		assets[asset.ID] = true
		if _, exists := byID[asset.ItemID]; !exists {
			return nil, ErrInvalid
		}
		if asset.Size <= 0 || asset.Size > MaxImportContentBytes-size {
			return nil, ErrInvalid
		}
		size += asset.Size
		if asset.FileName == "" || strings.ContainsAny(asset.FileName, "/\\\x00") || !utf8.ValidString(asset.FileName) {
			return nil, ErrInvalid
		}
		switch asset.MIME {
		case "image/png", "image/jpeg", "image/gif", "image/webp":
		default:
			return nil, ErrInvalid
		}
		digest, err := hex.DecodeString(asset.SHA256)
		if err != nil || len(digest) != 32 || hex.EncodeToString(digest) != asset.SHA256 {
			return nil, ErrInvalid
		}
	}
	return order, nil
}
