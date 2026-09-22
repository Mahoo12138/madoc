package core

import (
	"errors"
	"testing"
)

func TestMarkdownExportWatermarkAndGeneration(t *testing.T) {
	f := newFixture(t)
	doc, _ := f.core.CreateItem(f.ctx, f.owner.ID, f.space.ID, "markdown", "Doc", nil)
	first, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "first", []byte{1}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.ExportMarkdown(f.ctx, f.owner.ID, doc.ID, nil); !errors.Is(err, ErrMarkdownExportPending) {
		t.Fatalf("stale default export: %v", err)
	}
	if err := f.core.UpdateMarkdownCache(f.ctx, f.owner.ID, doc.ID, "first", first, 0); err != nil {
		t.Fatal(err)
	}
	second, err := f.core.AppendMarkdownUpdate(f.ctx, f.owner.ID, doc.ID, "second", []byte{2}, 0)
	if err != nil {
		t.Fatal(err)
	}
	state, err := f.core.ExportMarkdown(f.ctx, f.owner.ID, doc.ID, &MarkdownExportTarget{Generation: 0, MinSeq: first})
	if err != nil || state.Markdown != "first" || state.CacheSeq != first {
		t.Fatalf("target export = %#v, %v", state, err)
	}
	for _, target := range []*MarkdownExportTarget{nil, {Generation: 0, MinSeq: second}} {
		if _, err := f.core.ExportMarkdown(f.ctx, f.owner.ID, doc.ID, target); !errors.Is(err, ErrMarkdownExportPending) {
			t.Fatalf("new target should wait: %v", err)
		}
	}
	if err := f.core.UpdateMarkdownCache(f.ctx, f.owner.ID, doc.ID, "", second, 0); err != nil {
		t.Fatal(err)
	}
	state, err = f.core.ExportMarkdown(f.ctx, f.owner.ID, doc.ID, nil)
	if err != nil || state.Markdown != "" {
		t.Fatalf("empty export = %#v, %v", state, err)
	}
	if err := f.core.ResetMarkdown(f.ctx, f.owner.ID, doc.ID, nil, "replacement"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.ExportMarkdown(f.ctx, f.owner.ID, doc.ID, &MarkdownExportTarget{Generation: 0, MinSeq: 0}); !errors.Is(err, ErrGeneration) {
		t.Fatalf("old generation exported: %v", err)
	}
	state, err = f.core.ExportMarkdown(f.ctx, f.owner.ID, doc.ID, &MarkdownExportTarget{Generation: 1, MinSeq: 0})
	if err != nil || state.Markdown != "replacement" {
		t.Fatalf("new generation = %#v, %v", state, err)
	}
	viewer := f.addUser("export-viewer@example.com", "viewer")
	outsider := f.addUser("export-outsider@example.com", "")
	if _, err := f.core.ExportMarkdown(f.ctx, viewer.ID, doc.ID, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := f.core.ExportMarkdown(f.ctx, outsider.ID, doc.ID, nil); !errors.Is(err, ErrForbidden) {
		t.Fatalf("private export = %v", err)
	}
}
