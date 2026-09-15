-- script_patterns: the RAG craft library.
--
-- Run in the Supabase SQL editor when moving off demo mode. In demo mode the
-- same rows live in the local SQLite store; the loader and retrieval code are
-- identical in both modes.
--
-- HISTORY, because it matters to anyone reading the git blame: this file
-- described a table the loader could not write to. It carried
-- `one_line_takeaway` and `structural_pattern` as NOT NULL columns that nothing
-- has written for months, it was missing the seven columns the loader does
-- write (craft_level, technique, problem, how_it_works, how_to_apply,
-- worked_example, warning_sign), and its source_type check rejected 'craft',
-- which is the type every entry written since the corpus moved to craft
-- techniques uses.
--
-- Nobody noticed because the file has never been run: every environment to date
-- is the SQLite mock, which creates columns on demand. The first real Supabase
-- deploy would have created this table successfully, then failed on the first
-- `load_knowledge_base.py` run with an error about a column that does not
-- exist. `tests/test_pattern_schema.py` now fails if the two ever drift again.

create extension if not exists vector;

create table if not exists script_patterns (
  id uuid primary key default gen_random_uuid(),

  -- Maintainer label. Never embedded, deliberately: matching should be
  -- structural, not fame-based. It is also the upsert key — the loader
  -- replaces by title_ref, which is what makes re-running it safe.
  title_ref text not null unique,

  source_type text not null
    check (source_type in ('movie','webseries','short','craft')),
  craft_level text not null
    check (craft_level in ('structure','scene','dialogue','character','image')),
  genre text not null,
  origin_tradition text not null,

  -- The craft entry itself. `problem` and `warning_sign` are the two fields
  -- that get embedded (see rag.pattern_to_text) because both state the symptom,
  -- which is the register a writer's query arrives in.
  technique text not null,
  problem text not null,
  how_it_works text not null,
  how_to_apply text not null,
  worked_example text not null,
  warning_sign text not null,

  -- Which craft this entry serves: 'screenplay', 'video', or both.
  -- NULL means both, which is what every entry written before long-form video
  -- existed means — see rag.DEFAULT_APPLIES_TO. The exclusion runs one way:
  -- video-only entries stay out of a screenwriter's results, because a
  -- screenwriter asking about a sagging middle should not be told about
  -- retention curves.
  applies_to text[],

  embed_text text not null,            -- exactly what was embedded, so a
                                       -- re-embed can be diffed rather than
                                       -- guessed at
  embedding vector(384) not null,      -- BAAI/bge-small-en-v1.5 via fastembed
  created_at timestamptz default now()
);

-- Exact scan is instant at this scale; HNSW is created up front so nothing
-- changes as the library grows past 500 entries.
create index if not exists script_patterns_embedding_idx
  on script_patterns using hnsw (embedding vector_cosine_ops);

-- The linter looks entries up by technique name rather than by embedding,
-- because when a rule fires it already knows which entry fixes it.
create index if not exists script_patterns_technique_idx
  on script_patterns (technique);

-- Server-side similarity search. `rag.retrieve_relevant_patterns` calls this
-- when it is available and falls back to fetch-all-and-rank when it is not, so
-- the two must return the same field set AND the same rows.
--
-- `filter_craft` is what makes that second half true. Without it this function
-- ranks the WHOLE table, and the one-way exclusion the craft library is built
-- on stops holding the moment the RPC is used. Measured against the real
-- database on 2026-09-14, for a screenwriter asking why their opening does not
-- hold:
--
--     0.698  The cost of the first thirty seconds (long-form video)   <-- first
--     0.670  The closing-doors middle (screen craft)
--     0.662  Late entry, early exit (screen craft)
--     0.645  Cold open at the crisis (shorts craft)
--     0.620  The promise nobody kept (long-form video)
--
-- Two of the top five are video craft and one of them is the card the writer's
-- eye lands on. `rag._serves` excludes exactly those on the Python path, so the
-- two paths disagreed about what a screenwriter is allowed to be told.
--
-- NULL means "every craft", which is what a caller that does not care passes.
--
-- One caveat worth knowing before the library is large enough for this to run:
-- a WHERE clause alongside an HNSW scan is post-filtered, so at scale this can
-- return FEWER than match_count rows. At the size where the RPC starts being
-- worth using (see rag.RPC_THRESHOLD) that has not been measured.
drop function if exists match_script_patterns(vector(384), int);

create or replace function match_script_patterns(
  query_embedding vector(384),
  match_count int default 3,
  filter_craft text default null
) returns table (
  title_ref text, source_type text, craft_level text, genre text,
  origin_tradition text, technique text, problem text, how_it_works text,
  how_to_apply text, worked_example text, warning_sign text,
  applies_to text[], similarity float
) language sql stable as $$
  select p.title_ref, p.source_type, p.craft_level, p.genre,
         p.origin_tradition, p.technique, p.problem, p.how_it_works,
         p.how_to_apply, p.worked_example, p.warning_sign,
         coalesce(p.applies_to, array['screenplay', 'video']) as applies_to,
         1 - (p.embedding <=> query_embedding) as similarity
  from script_patterns p
  where filter_craft is null
     or filter_craft = any(coalesce(p.applies_to, array['screenplay', 'video']))
  order by p.embedding <=> query_embedding
  limit match_count
$$;

-- --------------------------------------------------------------------------
-- Migration, for a database created from the version of this file that shipped
-- before 2026-09-03. Safe to run on a fresh database too — every statement is
-- conditional.

alter table script_patterns
  add column if not exists craft_level text,
  add column if not exists technique text,
  add column if not exists problem text,
  add column if not exists how_it_works text,
  add column if not exists how_to_apply text,
  add column if not exists worked_example text,
  add column if not exists warning_sign text;

-- These two columns exist only on a database created from the OLD version of
-- this file, where they were NOT NULL and nothing wrote them. On a fresh
-- database they do not exist at all, and a bare ALTER would fail the whole
-- script — which is the worst possible moment for it, since this is the first
-- thing anyone runs against a new project. Guarded rather than assumed.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'script_patterns'
               and column_name = 'one_line_takeaway') then
    alter table script_patterns alter column one_line_takeaway drop not null;
  end if;
  if exists (select 1 from information_schema.columns
             where table_name = 'script_patterns'
               and column_name = 'structural_pattern') then
    alter table script_patterns alter column structural_pattern drop not null;
  end if;
end $$;

-- 'craft' was not in the original check constraint, so every entry written
-- since the corpus moved to craft techniques would have been rejected.
alter table script_patterns drop constraint if exists script_patterns_source_type_check;
alter table script_patterns add constraint script_patterns_source_type_check
  check (source_type in ('movie','webseries','short','craft'));


-- Migration, 2026-09-14. Long-form video added `applies_to`, and without this
-- column `load_knowledge_base.py` fails on the first insert: Postgres rejects
-- the whole row rather than dropping the unknown field.
--
-- Safe on existing data. NULL means "serves both crafts", which is exactly
-- what every one of the 39 entries that predate long-form video means, so
-- nothing needs backfilling and no existing retrieval changes.
alter table script_patterns
  add column if not exists applies_to text[];


-- Migration, 2026-09-14 (second). `match_script_patterns` gained a third
-- argument, `filter_craft`, and a fourth returned column, `applies_to`.
--
-- The `drop function if exists match_script_patterns(vector(384), int)` above
-- is the whole migration and it is NOT optional: a bare `create or replace`
-- with a new argument list creates a second overload rather than replacing the
-- first, and a call naming only `query_embedding` and `match_count` then
-- matches both — the third argument has a default — and Postgres rejects it as
-- ambiguous. Re-running this file end to end does the right thing on a
-- database at either version.
--
-- Until it is run, `rag._rpc_search` calls a signature the database does not
-- have, gets a 404 from PostgREST, logs once and ranks in Python instead. That
-- is correct, just slower, which is the only thing the RPC was ever for.
