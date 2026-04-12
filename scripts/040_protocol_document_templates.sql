-- Protocol document templates (uploaded DOCX/PDF) + optional link from protocols
-- Preferred storage: shared bucket `user` (same as literature), path `{organization_id}/protocol/{template_id}/...` — run scripts/041_protocol_templates_user_bucket.sql
-- Optional legacy bucket `protocol-templates` (policies below): create in Dashboard if you still use old keys
-- MIME: application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document

CREATE TABLE IF NOT EXISTS public.protocol_document_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  source_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  extracted JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_protocol_document_templates_org
  ON public.protocol_document_templates(organization_id);

CREATE INDEX IF NOT EXISTS idx_protocol_document_templates_created_by
  ON public.protocol_document_templates(created_by);

ALTER TABLE public.protocol_document_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can select protocol document templates" ON public.protocol_document_templates;
DROP POLICY IF EXISTS "Org members can insert protocol document templates" ON public.protocol_document_templates;
DROP POLICY IF EXISTS "Org members can update protocol document templates" ON public.protocol_document_templates;
DROP POLICY IF EXISTS "Org members can delete protocol document templates" ON public.protocol_document_templates;

CREATE POLICY "Org members can select protocol document templates"
  ON public.protocol_document_templates FOR SELECT
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can insert protocol document templates"
  ON public.protocol_document_templates FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id(auth.uid())
    AND (created_by IS NULL OR created_by = auth.uid())
  );

CREATE POLICY "Org members can update protocol document templates"
  ON public.protocol_document_templates FOR UPDATE
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can delete protocol document templates"
  ON public.protocol_document_templates FOR DELETE
  USING (organization_id = get_user_organization_id(auth.uid()));

ALTER TABLE public.protocols
  ADD COLUMN IF NOT EXISTS document_template_id UUID REFERENCES public.protocol_document_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_protocols_document_template_id
  ON public.protocols(document_template_id)
  WHERE document_template_id IS NOT NULL;

-- Storage policies for bucket protocol-templates (path: {organization_id}/{template_id}/...)
DROP POLICY IF EXISTS "Org read protocol-templates" ON storage.objects;
DROP POLICY IF EXISTS "Org insert protocol-templates" ON storage.objects;
DROP POLICY IF EXISTS "Org update protocol-templates" ON storage.objects;
DROP POLICY IF EXISTS "Org delete protocol-templates" ON storage.objects;

CREATE POLICY "Org read protocol-templates"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'protocol-templates'
    AND (storage.foldername(name))[1] = (SELECT organization_id::text FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Org insert protocol-templates"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'protocol-templates'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = (SELECT organization_id::text FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Org update protocol-templates"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'protocol-templates'
    AND (storage.foldername(name))[1] = (SELECT organization_id::text FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Org delete protocol-templates"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'protocol-templates'
    AND (storage.foldername(name))[1] = (SELECT organization_id::text FROM public.profiles WHERE id = auth.uid())
  );
