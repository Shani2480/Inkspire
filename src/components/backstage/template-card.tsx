import type { DocumentTemplate } from "@/document/templates"
import { templatePreviewHtml } from "@/document/template-preview"

export function TemplateCard({ template, onSelect }: { template: DocumentTemplate; onSelect: () => void }) {
  return (
    <button type="button" className="backstage-template" onClick={onSelect}>
      <span className={`backstage-template-thumb is-${template.preview}`} aria-hidden>
        <TemplatePreview kind={template.preview} html={template.html} />
      </span>
      <span className="backstage-template-title">{template.title}</span>
    </button>
  )
}

function TemplatePreview({ kind, html }: { kind: DocumentTemplate["preview"]; html: string }) {
  if (kind === "live") {
    // The page itself at full size, shrunk to the thumbnail by CSS; the HTML is the editor's own rendering of our template.
    return (
      <span className="template-thumb-page">
        <span className="ProseMirror" dangerouslySetInnerHTML={{ __html: templatePreviewHtml(html) }} />
      </span>
    )
  }
  if (kind === "blank") {
    return <span className="backstage-preview-blank" />
  }
  if (kind === "letter") {
    return (
      <span className="backstage-preview-lines">
        <i className="w-[40%]" />
        <i className="w-[55%]" />
        <i className="mt-2 w-[70%]" />
        <i className="w-full" />
        <i className="w-[90%]" />
        <i className="w-[60%]" />
      </span>
    )
  }
  if (kind === "resume") {
    return (
      <span className="backstage-preview-resume">
        <i className="head" />
        <span className="cols">
          <span>
            <b />
            <i />
            <i />
          </span>
          <span>
            <b />
            <i />
            <i />
            <i />
          </span>
        </span>
      </span>
    )
  }
  if (kind === "handbook") {
    return (
      <span className="backstage-preview-handbook">
        <b />
        <i />
        <i />
        <span className="table" />
      </span>
    )
  }
  return (
    <span className="backstage-preview-lines">
      <b className="w-[70%]" />
      <i className="w-full" />
      <i className="w-[85%]" />
      <i className="w-[55%]" />
    </span>
  )
}
