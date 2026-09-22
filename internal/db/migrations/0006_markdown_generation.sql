-- A reset starts a new content generation; old offline writes must not merge into it.
ALTER TABLE markdown_states ADD COLUMN generation INTEGER NOT NULL DEFAULT 0;
