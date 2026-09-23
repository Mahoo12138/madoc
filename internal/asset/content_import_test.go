package asset

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/textproto"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/google/uuid"
	"madoc/internal/auth"
	"madoc/internal/core"
	"madoc/internal/db"
)

type importTestFixture struct {
	service                *Service
	domain                 *core.Service
	conn                   *sql.DB
	owner, workspace, path string
}

func newImportTestFixture(t *testing.T) importTestFixture {
	t.Helper()
	path := filepath.Join(t.TempDir(), "data.db")
	conn, err := db.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	owner, _, err := auth.New(conn).SetupAdmin(context.Background(), "Owner", "owner@test", "password123")
	if err != nil {
		t.Fatal(err)
	}
	domain := core.New(conn)
	workspace, err := domain.CreateWorkspace(context.Background(), owner.ID, "Imports")
	if err != nil {
		t.Fatal(err)
	}
	return importTestFixture{New(conn, domain, t.TempDir(), 20), domain, conn, owner.ID, workspace.ID, path}
}
func importTestPlan() (core.ContentImport, []byte) {
	image := append([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, bytes.Repeat([]byte{0}, 520)...)
	hash := sha256.Sum256(image)
	root := uuid.NewString()
	asset := uuid.NewString()
	return core.ContentImport{ID: uuid.NewString(), Items: []core.ImportItem{{ID: root, Type: "markdown", Title: "Imported", Markdown: &core.InitialMarkdown{Snapshot: []byte{1, 2, 3}, Markdown: "![image](/api/assets/" + asset + ")"}}}, Assets: []core.ImportAsset{{ID: asset, ItemID: root, FileName: "image.png", MIME: "image/png", Size: int64(len(image)), SHA256: hex.EncodeToString(hash[:])}}}, image
}
func attachmentBody(t *testing.T, plan core.ContentImport, payloads [][]byte) ([]byte, string) {
	t.Helper()
	var buffer bytes.Buffer
	writer := multipart.NewWriter(&buffer)
	for index, data := range payloads {
		asset := plan.Assets[index%len(plan.Assets)]
		header := textproto.MIMEHeader{}
		header.Set("Content-Disposition", `form-data; name="`+asset.ID+`"; filename="image.png"`)
		header.Set("Content-Type", asset.MIME)
		part, err := writer.CreatePart(header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = part.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes(), writer.Boundary()
}
func performImport(t *testing.T, f importTestFixture, plan core.ContentImport, payloads ...[]byte) (core.ImportResult, error) {
	t.Helper()
	body, boundary := attachmentBody(t, plan, payloads)
	return f.service.ImportContent(context.Background(), f.owner, f.workspace, plan, multipart.NewReader(bytes.NewReader(body), boundary))
}
func assertImportStorage(t *testing.T, f importTestFixture, items, assets, attempts int) {
	t.Helper()
	for table, want := range map[string]int{"items": items, "assets": assets} {
		var count int
		if err := f.conn.QueryRow(`SELECT count(*) FROM ` + table).Scan(&count); err != nil || count != want {
			t.Fatalf("%s = %d want %d (%v)", table, count, want, err)
		}
	}
	entries, err := os.ReadDir(filepath.Join(f.service.root, f.workspace, ".imports"))
	if errors.Is(err, os.ErrNotExist) {
		entries = nil
	} else if err != nil {
		t.Fatal(err)
	}
	if len(entries) != attempts {
		t.Fatalf("attempt directories = %d want %d", len(entries), attempts)
	}
}

func TestImportFilesCommitReplayAndRecoveryKeepCommittedBytes(t *testing.T) {
	f := newImportTestFixture(t)
	plan, image := importTestPlan()
	result, err := performImport(t, f, plan, image)
	if err != nil || result.Replayed {
		t.Fatalf("import: %+v %v", result, err)
	}
	asset, file, err := f.service.Open(context.Background(), f.owner, plan.Assets[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	data, err := io.ReadAll(file)
	file.Close()
	if err != nil || !bytes.Equal(data, image) {
		t.Fatal("asset bytes changed")
	}
	if err := f.service.cleanupImportDirectory(context.Background(), filepath.Dir(asset.StorageKey)); err != nil {
		t.Fatal(err)
	}
	if err := f.service.RecoverImports(context.Background()); err != nil {
		t.Fatal(err)
	}
	if data, err := os.ReadFile(filepath.Join(f.service.root, asset.StorageKey)); err != nil || !bytes.Equal(data, image) {
		t.Fatal("cleanup deleted committed bytes")
	}
	replay, err := performImport(t, f, plan, image)
	if err != nil || !replay.Replayed || replay.RootID != result.RootID {
		t.Fatalf("replay: %+v %v", replay, err)
	}
	assertImportStorage(t, f, 1, 1, 1)
}

func TestImportFilesFailuresRemoveOnlyTheirAttempt(t *testing.T) {
	for _, kind := range []string{"digest", "MIME", "short", "long", "missing", "duplicate", "database", "extra"} {
		t.Run(kind, func(t *testing.T) {
			f := newImportTestFixture(t)
			plan, image := importTestPlan()
			old, err := f.service.Save(context.Background(), f.owner, f.workspace, nil, uploadHeader(t, "kept.png", "image/png", image))
			if err != nil {
				t.Fatal(err)
			}
			payloads := [][]byte{image}
			switch kind {
			case "digest":
				payloads[0] = append([]byte(nil), image...)
				payloads[0][100] = 1
			case "MIME":
				payloads[0] = bytes.Repeat([]byte{'x'}, len(image))
			case "short":
				payloads[0] = image[:100]
			case "long":
				payloads[0] = append(append([]byte(nil), image...), 1)
			case "missing":
				payloads = nil
			case "duplicate":
				payloads = append(payloads, image)
			case "database":
				if _, err := f.conn.Exec(`CREATE TRIGGER fail_import BEFORE INSERT ON content_imports BEGIN SELECT RAISE(ABORT,'fail'); END`); err != nil {
					t.Fatal(err)
				}
			}
			body, boundary := attachmentBody(t, plan, payloads)
			if kind == "extra" {
				plan.Assets = nil
			}
			if _, err := f.service.ImportContent(context.Background(), f.owner, f.workspace, plan, multipart.NewReader(bytes.NewReader(body), boundary)); err == nil {
				t.Fatal("expected failure")
			}
			assertImportStorage(t, f, 0, 1, 0)
			data, err := os.ReadFile(filepath.Join(f.service.root, old.StorageKey))
			if err != nil || !bytes.Equal(data, image) {
				t.Fatal("existing file changed")
			}
		})
	}
}

func TestImportFilesLaterInvalidAttachmentRollsBackEarlierFiles(t *testing.T) {
	f := newImportTestFixture(t)
	plan, image := importTestPlan()
	second := plan.Assets[0]
	second.ID = uuid.NewString()
	plan.Assets = append(plan.Assets, second)
	bad := append([]byte(nil), image...)
	bad[len(bad)-1] = 1
	if _, err := performImport(t, f, plan, image, bad); err == nil {
		t.Fatal("expected second attachment rejection")
	}
	assertImportStorage(t, f, 0, 0, 0)
	if _, err := performImport(t, f, plan, image, image); err != nil {
		t.Fatal(err)
	}
	assertImportStorage(t, f, 1, 2, 1)
}

func TestImportFilesConcurrentRetryOwnsSeparateDirectories(t *testing.T) {
	f := newImportTestFixture(t)
	plan, image := importTestPlan()
	body, boundary := attachmentBody(t, plan, [][]byte{image})
	var wg sync.WaitGroup
	results := make(chan core.ImportResult, 4)
	failures := make(chan error, 4)
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			result, err := f.service.ImportContent(context.Background(), f.owner, f.workspace, plan, multipart.NewReader(bytes.NewReader(body), boundary))
			results <- result
			failures <- err
		}()
	}
	wg.Wait()
	close(results)
	close(failures)
	for err := range failures {
		if err != nil {
			t.Fatal(err)
		}
	}
	commits := 0
	for result := range results {
		if !result.Replayed {
			commits++
		}
	}
	if commits != 1 {
		t.Fatalf("commits=%d", commits)
	}
	assertImportStorage(t, f, 1, 1, 1)
}

type importGateReader struct {
	entered chan struct{}
	release chan struct{}
	once    sync.Once
	ctx     context.Context
	after   func()
}

func (r *importGateReader) Read([]byte) (int, error) {
	r.once.Do(func() { close(r.entered) })
	select {
	case <-r.release:
		if r.after != nil {
			r.after()
		}
		return 0, io.EOF
	case <-r.ctx.Done():
		return 0, r.ctx.Err()
	}
}

func TestImportFilesCancelledUploadIsNeverPublished(t *testing.T) {
	f := newImportTestFixture(t)
	plan, image := importTestPlan()
	body, boundary := attachmentBody(t, plan, [][]byte{image})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	gate := &importGateReader{entered: make(chan struct{}), release: make(chan struct{}), ctx: ctx}
	source := io.MultiReader(bytes.NewReader(body[:len(body)/2]), gate, bytes.NewReader(body[len(body)/2:]))
	result := make(chan error, 1)
	go func() {
		_, err := f.service.ImportContent(ctx, f.owner, f.workspace, plan, multipart.NewReader(source, boundary))
		result <- err
	}()
	<-gate.entered
	items, err := f.domain.ListItems(context.Background(), f.owner, f.workspace)
	if err != nil || len(items) != 0 {
		t.Fatal("partial items visible")
	}
	if _, file, err := f.service.Open(context.Background(), f.owner, plan.Assets[0].ID); !errors.Is(err, core.ErrNotFound) {
		if file != nil {
			file.Close()
		}
		t.Fatalf("partial asset visible: %v", err)
	}
	cancel()
	if err := <-result; err == nil {
		t.Fatal("expected cancellation")
	}
	assertImportStorage(t, f, 0, 0, 0)
}

func TestImportRecoveryPreservesUnknownDataAndCleansUnreferencedJournal(t *testing.T) {
	f := newImportTestFixture(t)
	plan, image := importTestPlan()
	body, boundary := attachmentBody(t, plan, [][]byte{image})
	// Close the database after staging but before publishing; cleanup must retain
	// files when it cannot prove that the attempted commit did not reference them.
	marker := []byte("--" + boundary + "--")
	split := bytes.LastIndex(body, marker)
	gate := &importGateReader{entered: make(chan struct{}), release: make(chan struct{}), ctx: context.Background(), after: func() { f.conn.Close() }}
	close(gate.release)
	source := io.MultiReader(bytes.NewReader(body[:split]), gate, bytes.NewReader(body[split:]))
	if _, err := f.service.ImportContent(context.Background(), f.owner, f.workspace, plan, multipart.NewReader(source, boundary)); err == nil {
		t.Fatal("expected unavailable database")
	}
	entries, err := os.ReadDir(filepath.Join(f.service.root, f.workspace, ".imports"))
	if err != nil || len(entries) != 1 {
		t.Fatal("uncertain attempt was not retained")
	}
	conn, err := db.Open(f.path)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	service := New(conn, core.New(conn), f.service.root, 20)
	unknown := filepath.Join(service.root, f.workspace, ".imports", uuid.NewString())
	if err = os.MkdirAll(unknown, 0o750); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(unknown, "user-data"), []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err = service.RecoverImports(context.Background()); err != nil {
		t.Fatal(err)
	}
	entries, err = os.ReadDir(filepath.Join(service.root, f.workspace, ".imports"))
	if err != nil || len(entries) != 1 || entries[0].Name() != filepath.Base(unknown) {
		t.Fatal("recovery removed wrong directory")
	}
	if data, err := os.ReadFile(filepath.Join(unknown, "user-data")); err != nil || string(data) != "keep" {
		t.Fatal("unknown data removed")
	}
}

func TestImportRecoveryRefusesUnexpectedFileInRecognisedJournal(t *testing.T) {
	f := newImportTestFixture(t)
	attempt := uuid.NewString()
	asset := uuid.NewString()
	directory := filepath.Join(f.service.root, f.workspace, ".imports", attempt)
	if err := os.MkdirAll(directory, 0o750); err != nil {
		t.Fatal(err)
	}
	journal, _ := json.Marshal(importJournal{Version: 1, WorkspaceID: f.workspace, AttemptID: attempt, Assets: []string{asset}})
	if err := os.WriteFile(filepath.Join(directory, "journal.json"), journal, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(directory, "unexpected"), []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := f.service.RecoverImports(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(directory, "unexpected")); err != nil {
		t.Fatal("unexpected data deleted")
	}
}

func TestImportFilesRechecksPermissionAfterUpload(t *testing.T) {
	for _, change := range []string{`UPDATE workspace_members SET role='viewer'`, `UPDATE users SET disabled=1`} {
		t.Run(change, func(t *testing.T) {
			f := newImportTestFixture(t)
			plan, image := importTestPlan()
			body, boundary := attachmentBody(t, plan, [][]byte{image})
			split := bytes.LastIndex(body, []byte("--"+boundary+"--"))
			gate := &importGateReader{entered: make(chan struct{}), release: make(chan struct{}), ctx: context.Background(), after: func() {
				if _, err := f.conn.Exec(change); err != nil {
					t.Fatal(err)
				}
			}}
			close(gate.release)
			source := io.MultiReader(bytes.NewReader(body[:split]), gate, bytes.NewReader(body[split:]))
			if _, err := f.service.ImportContent(context.Background(), f.owner, f.workspace, plan, multipart.NewReader(source, boundary)); !errors.Is(err, core.ErrForbidden) {
				t.Fatalf("permission changed: %v", err)
			}
			assertImportStorage(t, f, 0, 0, 0)
		})
	}
}

func TestImportFilesCollisionNeverOverwritesExistingAsset(t *testing.T) {
	f := newImportTestFixture(t)
	plan, image := importTestPlan()
	old, err := f.service.Save(context.Background(), f.owner, f.workspace, nil, uploadHeader(t, "kept.png", "image/png", image))
	if err != nil {
		t.Fatal(err)
	}
	plan.Assets[0].ID = old.ID
	if _, err := performImport(t, f, plan, image); !errors.Is(err, core.ErrConflict) {
		t.Fatalf("collision: %v", err)
	}
	assertImportStorage(t, f, 0, 1, 0)
	data, err := os.ReadFile(filepath.Join(f.service.root, old.StorageKey))
	if err != nil || !bytes.Equal(data, image) {
		t.Fatal("existing bytes overwritten")
	}
}

func TestImportRecoveryDoesNotFollowSymlinks(t *testing.T) {
	f := newImportTestFixture(t)
	attempt := uuid.NewString()
	asset := uuid.NewString()
	directory := filepath.Join(f.service.root, f.workspace, ".imports", attempt)
	if err := os.MkdirAll(directory, 0o750); err != nil {
		t.Fatal(err)
	}
	journal, _ := json.Marshal(importJournal{Version: 1, WorkspaceID: f.workspace, AttemptID: attempt, Assets: []string{asset}})
	if err := os.WriteFile(filepath.Join(directory, "journal.json"), journal, 0o600); err != nil {
		t.Fatal(err)
	}
	external := filepath.Join(t.TempDir(), "keep")
	if err := os.WriteFile(external, []byte("private"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(external, filepath.Join(directory, asset)); err != nil {
		t.Fatal(err)
	}
	if err := f.service.RecoverImports(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Lstat(filepath.Join(directory, asset)); err != nil {
		t.Fatal("symlink-containing attempt removed")
	}
	if data, err := os.ReadFile(external); err != nil || string(data) != "private" {
		t.Fatal("symlink target changed")
	}
}
