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
-- the two must return the same field set.
create or replace function match_script_patterns(
  query_embedding vector(384),
  match_count int default 3
) returns table (
  title_ref text, source_type text, craft_level text, genre text,
  origin_tradition text, technique text, problem text, how_it_works text,
  how_to_apply text, worked_example text, warning_sign text, similarity float
) language sql stable as $$
  select p.title_ref, p.source_type, p.craft_level, p.genre,
         p.origin_tradition, p.technique, p.problem, p.how_it_works,
         p.how_to_apply, p.worked_example, p.warning_sign,
         1 - (p.embedding <=> query_embedding) as similarity
  from script_patterns p
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

alter table script_patterns alter column one_line_takeaway drop not null;
alter table script_patterns alter column structural_pattern drop not null;

-- 'craft' was not in the original check constraint, so every entry written
-- since the corpus moved to craft techniques would have been rejected.
alter table script_patterns drop constraint if exists script_patterns_source_type_check;
alter table script_patterns add constraint script_patterns_source_type_check
  check (source_type in ('movie','webseries','short','craft'));
