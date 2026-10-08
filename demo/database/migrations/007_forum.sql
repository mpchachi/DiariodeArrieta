-- ═══════════════════════════════════════════════════════════════════════════════
-- FixedGap — foro (sustituye al chat): un canal tipo Reddit con publicaciones y
-- comentarios. TODAS las cuentas (médicos y equipo FixedGap) lo leen; cada uno solo
-- edita o borra lo suyo. Sin datos de pacientes: es un canal de comunicación.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE public.forum_posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES public.operators(id) ON DELETE CASCADE,
  title         text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  body          text NOT NULL DEFAULT '' CHECK (char_length(body) <= 10000),
  comment_count integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_forum_posts_created ON public.forum_posts(created_at DESC);
CREATE INDEX idx_forum_posts_author ON public.forum_posts(author_id);

CREATE TABLE public.forum_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL DEFAULT auth.uid() REFERENCES public.operators(id) ON DELETE CASCADE,
  body        text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_forum_comments_post ON public.forum_comments(post_id, created_at);
CREATE INDEX idx_forum_comments_author ON public.forum_comments(author_id);

CREATE TRIGGER forum_posts_updated_at BEFORE UPDATE ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Contador de comentarios (lo mantiene la base de datos, no el cliente).
CREATE OR REPLACE FUNCTION private.forum_comment_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forum_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSE
    UPDATE public.forum_posts SET comment_count = greatest(comment_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.forum_comment_count() FROM public, anon, authenticated;
CREATE TRIGGER forum_comments_count AFTER INSERT OR DELETE ON public.forum_comments
  FOR EACH ROW EXECUTE FUNCTION private.forum_comment_count();

ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY forum_posts_select ON public.forum_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY forum_posts_insert ON public.forum_posts FOR INSERT TO authenticated WITH CHECK (author_id = (SELECT auth.uid()));
CREATE POLICY forum_posts_update ON public.forum_posts FOR UPDATE TO authenticated
  USING (author_id = (SELECT auth.uid())) WITH CHECK (author_id = (SELECT auth.uid()));
CREATE POLICY forum_posts_delete ON public.forum_posts FOR DELETE TO authenticated USING (author_id = (SELECT auth.uid()));

CREATE POLICY forum_comments_select ON public.forum_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY forum_comments_insert ON public.forum_comments FOR INSERT TO authenticated WITH CHECK (author_id = (SELECT auth.uid()));
CREATE POLICY forum_comments_delete ON public.forum_comments FOR DELETE TO authenticated USING (author_id = (SELECT auth.uid()));

-- El autor no puede falsear el contador ni cambiar de autor.
REVOKE UPDATE ON public.forum_posts FROM authenticated, anon;
GRANT UPDATE (title, body) ON public.forum_posts TO authenticated;
REVOKE UPDATE ON public.forum_comments FROM authenticated, anon;

ALTER PUBLICATION supabase_realtime ADD TABLE public.forum_posts, public.forum_comments;
