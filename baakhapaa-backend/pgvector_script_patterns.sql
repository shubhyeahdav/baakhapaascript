-- script_patterns: RAG pattern library for structure generation.
-- Run in the Supabase SQL editor when moving off demo mode. In demo mode the
-- same rows live in the local SQLite store; the loader and retrieval code are
-- identical in both modes.

create extension if not exists vector;

create table if not exists script_patterns (
  id uuid primary key default gen_random_uuid(),
  title_ref text not null unique,      -- maintainer label; never embedded
  source_type text not null check (source_type in ('movie','webseries','short')),
  genre text not null,
  origin_tradition text not null,
  one_line_takeaway text not null,
  structural_pattern text not null,
  embed_text text not null,            -- exactly what was embedded (enables re-embeds)
  embedding vector(384) not null,      -- BAAI/bge-small-en-v1.5 via fastembed
  created_at timestamptz default now()
);

-- Exact scan is instant at this scale; HNSW is created up front so nothing
-- changes as the library grows past 500 entries.
create index if not exists script_patterns_embedding_idx
  on script_patterns using hnsw (embedding vector_cosine_ops);

-- Server-side similarity search — switch retrieval to this RPC once the
-- library outgrows fetch-all-and-rank (~500+ rows):
--   supabase.rpc('match_script_patterns', {query_embedding: [...], match_count: 3})
create or replace function match_script_patterns(
  query_embedding vector(384),
  match_count int default 3
) returns table (
  title_ref text, genre text, origin_tradition text,
  one_line_takeaway text, structural_pattern text, similarity float
) language sql stable as $$
  select p.title_ref, p.genre, p.origin_tradition,
         p.one_line_takeaway, p.structural_pattern,
         1 - (p.embedding <=> query_embedding) as similarity
  from script_patterns p
  order by p.embedding <=> query_embedding
  limit match_count
$$;
