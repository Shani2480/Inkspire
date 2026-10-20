//! HTML transforms that map Inkspire document marks to Pandoc's docx conventions
//! (and back), plus a round-trip probe used by tests.

use regex::Regex;
use std::sync::OnceLock;

const AIWORD_CHROME: &str = r"<!--\s*aiword-[^>]*-->";

pub fn to_pandoc_html(html: &str) -> String {
    let without_chrome = strip_aiword_chrome(html);
    let with_comments = rewrite_aiword_comments_to_pandoc(&without_chrome);
    let with_tracks = rewrite_aiword_track_to_pandoc(&with_comments);
    rewrite_aiword_notes_to_pandoc(&with_tracks)
}

pub fn from_pandoc_html(html: &str) -> String {
    let with_notes = rewrite_pandoc_notes_to_aiword(html);
    let with_tracks = rewrite_pandoc_track_to_aiword(&with_notes);
    rewrite_pandoc_comments_to_aiword(&with_tracks)
}

fn strip_aiword_chrome(html: &str) -> String {
    chrome_re().replace_all(html, "").trim().to_string()
}

fn chrome_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(AIWORD_CHROME).expect("chrome regex"))
}

fn rewrite_aiword_comments_to_pandoc(html: &str) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        Regex::new(
            r#"(?is)<span\b([^>]*\bdata-comment-id\s*=\s*["']([^"']+)["'][^>]*)>(.*?)</span>"#,
        )
        .expect("comment regex")
    });
    re.replace_all(html, |caps: &regex::Captures| {
        let attrs = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        let id = caps.get(2).map(|m| m.as_str()).unwrap_or("");
        let inner = caps.get(3).map(|m| m.as_str()).unwrap_or("");
        let author = attr(attrs, "data-author").unwrap_or_else(|| "Me".into());
        let text = attr(attrs, "data-comment")
            .map(|value| decode_uri(&value))
            .unwrap_or_default();
        format!(
            r#"<span class="comment-start" id="{id}" data-author="{author}">{text}</span>{inner}<span class="comment-end" id="{id}"></span>"#,
            id = escape_attr(id),
            author = escape_attr(&author),
            text = escape_text(&text),
            inner = inner,
        )
    })
    .into_owned()
}

fn rewrite_aiword_track_to_pandoc(html: &str) -> String {
    let html = replace_track_span(html, "data-insertion", "insertion", "track-insertion");
    replace_track_span(&html, "data-deletion", "deletion", "track-deletion")
}

fn replace_track_span(html: &str, marker: &str, class_name: &str, class_alias: &str) -> String {
    let pattern = format!(
        r#"(?is)<span\b([^>]*\b(?:{marker}|class\s*=\s*["'][^"']*{class_alias}[^"']*["'])[^>]*)>(.*?)</span>"#
    );
    let re = Regex::new(&pattern).expect("track regex");
    re.replace_all(html, |caps: &regex::Captures| {
        let attrs = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        if !attrs.contains(marker) && !attrs.contains(class_alias) {
            return caps.get(0).map(|m| m.as_str().to_string()).unwrap_or_default();
        }
        let inner = caps.get(2).map(|m| m.as_str()).unwrap_or("");
        let author = attr(attrs, "data-author").unwrap_or_else(|| "Me".into());
        let date = attr(attrs, "data-time").unwrap_or_default();
        format!(
            r#"<span class="{class_name}" data-author="{author}" data-date="{date}">{inner}</span>"#,
            class_name = class_name,
            author = escape_attr(&author),
            date = escape_attr(&date),
            inner = inner,
        )
    })
    .into_owned()
}

fn rewrite_aiword_notes_to_pandoc(html: &str) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        Regex::new(r#"(?is)<sup\b([^>]*\bdata-note\s*=\s*["']([^"']+)["'][^>]*)>\s*</sup>"#)
            .expect("note regex")
    });
    let mut footnotes = Vec::new();
    let mut index = 0usize;
    let body = re
        .replace_all(html, |caps: &regex::Captures| {
            let attrs = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            let id = caps.get(2).map(|m| m.as_str()).unwrap_or("");
            let kind = attr(attrs, "data-kind").unwrap_or_else(|| "footnote".into());
            if kind != "footnote" {
                return caps.get(0).map(|m| m.as_str().to_string()).unwrap_or_default();
            }
            index += 1;
            let text = attr(attrs, "data-text").unwrap_or_default();
            footnotes.push((index, id.to_string(), text));
            format!(
                r#"<a href="{href}" class="footnote-ref" id="{ref_id}" role="doc-noteref" data-aiword-note="{id}"><sup>{index}</sup></a>"#,
                href = format!("#fn{index}"),
                ref_id = format!("fnref{index}"),
                index = index,
                id = escape_attr(id),
            )
        })
        .into_owned();

    if footnotes.is_empty() {
        return body;
    }
    let mut section = String::from(
        r#"<section id="footnotes" class="footnotes footnotes-end-of-document" role="doc-endnotes"><hr /><ol>"#,
    );
    for (number, id, text) in footnotes {
        section.push_str(&format!(
            r#"<li id="{li_id}" data-aiword-note="{id}"><p>{text}<a href="{back_href}" class="footnote-back" role="doc-backlink">↩︎</a></p></li>"#,
            li_id = format!("fn{number}"),
            back_href = format!("#fnref{number}"),
            id = escape_attr(&id),
            text = escape_text(&text),
        ));
    }
    section.push_str("</ol></section>");
    format!("{body}\n{section}")
}

fn rewrite_pandoc_comments_to_aiword(html: &str) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        Regex::new(
            r#"(?is)<span\b([^>]*\bclass\s*=\s*["'][^"']*\bcomment-start\b[^"']*["'][^>]*)>(.*?)</span>(.*?)<span\b([^>]*\bclass\s*=\s*["'][^"']*\bcomment-end\b[^"']*["'][^>]*)>\s*</span>"#,
        )
        .expect("pandoc comment regex")
    });
    re.replace_all(html, |caps: &regex::Captures| {
        let start_attrs = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        let comment_text = caps.get(2).map(|m| m.as_str()).unwrap_or("").trim();
        let inner = caps.get(3).map(|m| m.as_str()).unwrap_or("");
        let id = attr(start_attrs, "data-comment-id")
            .or_else(|| attr(start_attrs, "id"))
            .unwrap_or_else(|| "comment".into());
        let author = attr(start_attrs, "data-author")
            .or_else(|| attr(start_attrs, "author"))
            .unwrap_or_else(|| "Me".into());
        format!(
            r#"<span data-comment-id="{id}" data-author="{author}" data-comment="{comment}" data-time="" data-resolved="false" class="comment-mark">{inner}</span>"#,
            id = escape_attr(&id),
            author = escape_attr(&author),
            comment = escape_attr(&encode_uri(comment_text)),
            inner = inner,
        )
    })
    .into_owned()
}

fn rewrite_pandoc_track_to_aiword(html: &str) -> String {
    let html = replace_pandoc_track(html, "insertion", "data-insertion", "track-insertion");
    replace_pandoc_track(&html, "deletion", "data-deletion", "track-deletion")
}

fn replace_pandoc_track(html: &str, class_name: &str, marker: &str, class_alias: &str) -> String {
    let pattern = format!(
        r#"(?is)<span\b([^>]*\bclass\s*=\s*["'][^"']*\b{class_name}\b[^"']*["'][^>]*)>(.*?)</span>"#
    );
    let re = Regex::new(&pattern).expect("pandoc track regex");
    re.replace_all(html, |caps: &regex::Captures| {
        let attrs = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        let inner = caps.get(2).map(|m| m.as_str()).unwrap_or("");
        let author = attr(attrs, "data-author").unwrap_or_else(|| "Me".into());
        let time = attr(attrs, "data-date").unwrap_or_default();
        let id = format!("{class_name}-{}", short_hash(inner));
        format!(
            r#"<span {marker}="" data-id="{id}" data-author="{author}" data-time="{time}" class="{class_alias}">{inner}</span>"#,
            marker = marker,
            id = escape_attr(&id),
            author = escape_attr(&author),
            time = escape_attr(&time),
            class_alias = class_alias,
            inner = inner,
        )
    })
    .into_owned()
}

fn rewrite_pandoc_notes_to_aiword(html: &str) -> String {
    static ITEM_RE: OnceLock<Regex> = OnceLock::new();
    let item_re = ITEM_RE.get_or_init(|| {
        Regex::new(r#"(?is)<li\b([^>]*)>(.*?)</li>"#).expect("footnote item regex")
    });
    static SECTION_RE: OnceLock<Regex> = OnceLock::new();
    let section_re = SECTION_RE.get_or_init(|| {
        Regex::new(r#"(?is)<section\b[^>]*\bfootnotes\b[^>]*>.*?</section>"#)
            .expect("section regex")
    });
    static REF_RE: OnceLock<Regex> = OnceLock::new();
    let ref_re = REF_RE.get_or_init(|| {
        Regex::new(
            r#"(?is)<a\b([^>]*\bclass\s*=\s*["'][^"']*\bfootnote-ref\b[^"']*["'][^>]*)>\s*<sup>\s*([^<]*?)\s*</sup>\s*</a>"#,
        )
        .expect("footnote ref regex")
    });

    let mut notes: Vec<(String, String, String)> = Vec::new();
    if let Some(section) = section_re.find(html) {
        for caps in item_re.captures_iter(section.as_str()) {
            let attrs = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            let body = caps.get(2).map(|m| m.as_str()).unwrap_or("");
            let id = attr(attrs, "id").unwrap_or_default();
            let aiword_id = attr(attrs, "data-aiword-note").unwrap_or_else(|| id.clone());
            let text = strip_tags(&strip_backlink(body)).trim().to_string();
            notes.push((id, aiword_id, text));
        }
    }

    let without_section = section_re.replace_all(html, "").into_owned();
    ref_re
        .replace_all(&without_section, |caps: &regex::Captures| {
            let attrs = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            let number = caps.get(2).map(|m| m.as_str().trim()).unwrap_or("");
            let href = attr(attrs, "href").unwrap_or_default();
            let target = href.trim_start_matches('#').to_string();
            let aiword_id = attr(attrs, "data-aiword-note");
            let note = notes
                .iter()
                .find(|(id, ai_id, _)| id == &target || ai_id.as_str() == target || id.ends_with(number))
                .cloned();
            let (note_id, text) = match (&aiword_id, note) {
                (Some(id), Some((_, _, text))) => (id.clone(), text),
                (Some(id), None) => (id.clone(), String::new()),
                (None, Some((_, ai_id, text))) => (ai_id, text),
                (None, None) => (format!("fn-{number}"), String::new()),
            };
            format!(
                r#"<sup data-note="{id}" data-kind="footnote" data-text="{text}" class="doc-note"></sup>"#,
                id = escape_attr(&note_id),
                text = escape_attr(&text),
            )
        })
        .into_owned()
}

fn attr(attrs: &str, name: &str) -> Option<String> {
    let pattern = format!(
        r#"(?i)\b{}\s*=\s*(?:["']([^"']*)["']|([^\s>]+))"#,
        regex::escape(name)
    );
    let re = Regex::new(&pattern).ok()?;
    let caps = re.captures(attrs)?;
    caps.get(1)
        .or_else(|| caps.get(2))
        .map(|m| m.as_str().to_string())
}

fn strip_backlink(html: &str) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        Regex::new(r#"(?is)<a\b[^>]*\bfootnote-back\b[^>]*>.*?</a>"#).expect("backlink regex")
    });
    re.replace_all(html, "").into_owned()
}

fn strip_tags(html: &str) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(?is)<[^>]+>").expect("tag regex"));
    re.replace_all(html, " ").into_owned()
}

fn escape_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn escape_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn encode_uri(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            b' ' => out.push_str("%20"),
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

fn decode_uri(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (from_hex(bytes[i + 1]), from_hex(bytes[i + 2])) {
                out.push((hi << 4) | lo);
                i += 3;
                continue;
            }
        }
        if bytes[i] == b'+' {
            out.push(b' ');
        } else {
            out.push(bytes[i]);
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn from_hex(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

fn short_hash(value: &str) -> String {
    let mut hash = 0u32;
    for byte in value.bytes() {
        hash = hash.wrapping_mul(33).wrapping_add(u32::from(byte));
    }
    format!("{hash:x}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};
    use std::process::Command;

    #[derive(Debug, Clone, PartialEq, Eq)]
    struct FeatureResult {
        name: &'static str,
        kept: bool,
        note: &'static str,
    }

    #[derive(Debug, Clone, PartialEq, Eq)]
    struct RoundTripReport {
        features: Vec<FeatureResult>,
    }

    impl RoundTripReport {
        fn render(&self) -> String {
            let name_width = self
                .features
                .iter()
                .map(|feature| feature.name.len())
                .max()
                .unwrap_or(7)
                .max("Feature".len());
            let note_width = self
                .features
                .iter()
                .map(|feature| feature.note.len())
                .max()
                .unwrap_or(5)
                .max("Notes".len());
            let mut lines = vec![
                "# Docx round-trip report".to_string(),
                String::new(),
                "Sample HTML → Pandoc docx → HTML (with `--track-changes=all`), then Inkspire import mapping.".to_string(),
                String::new(),
                format!(
                    "| {:name_width$} | Kept | {:note_width$} |",
                    "Feature",
                    "Notes",
                    name_width = name_width,
                    note_width = note_width
                ),
                format!(
                    "| {:-<name_width$} | ---- | {:-<note_width$} |",
                    "",
                    "",
                    name_width = name_width,
                    note_width = note_width
                ),
            ];
            for feature in &self.features {
                let kept = if feature.kept { "yes" } else { "no " };
                lines.push(format!(
                    "| {:name_width$} | {kept}  | {:note_width$} |",
                    feature.name,
                    feature.note,
                    name_width = name_width,
                    note_width = note_width
                ));
            }
            lines.push(String::new());
            lines.push("Pandoc mapping:".to_string());
            lines.push(String::new());
            lines.push(
                "- Comments → `comment-start` / `comment-end` spans (docx track-changes comments)."
                    .to_string(),
            );
            lines.push("- Insertions / deletions → `insertion` / `deletion` spans (`--track-changes=all` on import).".to_string());
            lines.push("- Footnotes → Pandoc `footnote-ref` + footnotes section.".to_string());
            lines.push("- Nested lists, tables, images, bold/italic/underline, hyperlinks → native Pandoc HTML↔docx.".to_string());
            lines.push(
                "- Text color → not preserved by Pandoc's docx reader/writer (known gap)."
                    .to_string(),
            );
            lines.push("- Page setup / headers / footers → Inkspire HTML comments; Pandoc drops them on docx export.".to_string());
            lines.join("\n")
        }

        fn unexpected_losses(&self) -> Vec<&FeatureResult> {
            self.features
                .iter()
                .filter(|feature| {
                    !feature.kept && feature.name != "page setup" && feature.name != "color"
                })
                .collect()
        }
    }

    fn sample_document_html() -> String {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures/roundtrip-sample.html");
        std::fs::read_to_string(path).expect("roundtrip-sample.html fixture")
    }

    fn has_aiword_chrome(html: &str) -> bool {
        chrome_re().is_match(html)
    }

    fn has_nested_list(html: &str, tag: &str) -> bool {
        let open = format!("<{tag}");
        let close = format!("</{tag}>");
        let Some(first) = html.find(&open) else {
            return false;
        };
        let rest = &html[first + open.len()..];
        let Some(end) = rest.find(&close) else {
            return false;
        };
        rest[..end].contains(&open)
    }

    fn analyze_round_trip(recovered: &str) -> RoundTripReport {
        let lower = recovered.to_ascii_lowercase();
        RoundTripReport {
            features: vec![
                FeatureResult {
                    name: "headings",
                    kept: recovered.contains("<h1")
                        && recovered.contains("<h2")
                        && recovered.contains("Round trip sample"),
                    note: "h1/h2 text survives Pandoc html↔docx",
                },
                FeatureResult {
                    name: "comments",
                    kept: recovered.contains("data-comment-id=\"c1\"")
                        && (recovered.contains("Needs cite") || recovered.contains("Needs%20cite")),
                    note: "mapped to Pandoc comment-start/end; text carried in comment-start body",
                },
                FeatureResult {
                    name: "insertions",
                    kept: recovered.contains("data-insertion") && recovered.contains("inserted"),
                    note: "mapped to class=insertion; import uses --track-changes=all",
                },
                FeatureResult {
                    name: "deletions",
                    kept: recovered.contains("data-deletion") && recovered.contains("deleted"),
                    note: "mapped to class=deletion; import uses --track-changes=all",
                },
                FeatureResult {
                    name: "footnotes",
                    kept: recovered.contains("data-kind=\"footnote\"")
                        && recovered.contains("Footnote body"),
                    note: "mapped to Pandoc footnote-ref + footnotes section",
                },
                FeatureResult {
                    name: "nested lists",
                    kept: has_nested_list(&lower, "ul")
                        && has_nested_list(&lower, "ol")
                        && recovered.contains("Nested bullet")
                        && recovered.contains("Nested number"),
                    note: "nested ul/ol survive Pandoc list mapping",
                },
                FeatureResult {
                    name: "table",
                    kept: lower.contains("<table")
                        && lower.contains("<th")
                        && recovered.contains("Alpha")
                        && recovered.contains(">9<"),
                    note: "3×3 table with header row",
                },
                FeatureResult {
                    name: "image",
                    kept: lower.contains("<img")
                        && (lower.contains("data:image")
                            || lower.contains("media/")
                            || lower.contains("src=")),
                    note: "embedded image (data URI or Pandoc media path)",
                },
                FeatureResult {
                    name: "bold/italic",
                    kept: (lower.contains("<strong") || lower.contains("<b"))
                        && (lower.contains("<em") || lower.contains("<i"))
                        && recovered.contains("bold")
                        && recovered.contains("italic"),
                    note: "strong/em survive as bold/italic",
                },
                FeatureResult {
                    name: "underline",
                    kept: lower.contains("<u")
                        || lower.contains("text-decoration:underline")
                        || lower.contains("class=\"underline\""),
                    note: "underline tag or text-decoration",
                },
                FeatureResult {
                    name: "color",
                    kept: lower.contains("color:")
                        && (lower.contains("#c41e3a")
                            || lower.contains("rgb(196")
                            || lower.contains("c41e3a")),
                    note: "Pandoc docx reader/writer drops run color (expected loss)",
                },
                FeatureResult {
                    name: "hyperlink",
                    kept: lower.contains("<a ")
                        && lower.contains("href=")
                        && lower.contains("example.com")
                        && recovered.contains("Example link"),
                    note: "anchor with href preserved",
                },
                FeatureResult {
                    name: "page setup",
                    kept: has_aiword_chrome(recovered) && recovered.contains("aiword-page:"),
                    note: "Inkspire chrome comments are not part of Pandoc's docx model (expected loss)",
                },
            ],
        }
    }

    /// Pandoc on the PATH (it is not bundled; the app downloads it on request). The round-trip test skips without it.
    fn pandoc_on_path() -> Option<PathBuf> {
        let name = if cfg!(windows) {
            "pandoc.exe"
        } else {
            "pandoc"
        };
        std::env::split_paths(&std::env::var_os("PATH")?)
            .map(|dir| dir.join(name))
            .find(|candidate| candidate.is_file())
    }

    fn run_pandoc_docx_round_trip(html: &str) -> Result<String, String> {
        let pandoc = pandoc_on_path().ok_or_else(|| "pandoc is not installed".to_string())?;
        let dir = std::env::temp_dir().join(format!("aiword-roundtrip-{}", std::process::id()));
        std::fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
        let source = dir.join("source.html");
        let docx = dir.join("roundtrip.docx");
        let back = dir.join("back.html");
        std::fs::write(&source, to_pandoc_html(html).as_bytes()).map_err(|err| err.to_string())?;

        let export = Command::new(&pandoc)
            .args([
                "--from=html",
                "--to=docx",
                "--output",
                docx.to_string_lossy().as_ref(),
                "--",
                source.to_string_lossy().as_ref(),
            ])
            .output()
            .map_err(|err| format!("Could not start Pandoc: {err}"))?;
        if !export.status.success() {
            let _ = std::fs::remove_dir_all(&dir);
            return Err(String::from_utf8_lossy(&export.stderr).trim().to_string());
        }

        let import = Command::new(&pandoc)
            .args([
                "--from=docx",
                "--to=html",
                "--track-changes=all",
                "--wrap=none",
                "--output",
                back.to_string_lossy().as_ref(),
                "--",
                docx.to_string_lossy().as_ref(),
            ])
            .output()
            .map_err(|err| format!("Could not start Pandoc: {err}"))?;
        if !import.status.success() {
            let _ = std::fs::remove_dir_all(&dir);
            return Err(String::from_utf8_lossy(&import.stderr).trim().to_string());
        }

        let raw = std::fs::read_to_string(&back).map_err(|err| err.to_string())?;
        let _ = std::fs::remove_dir_all(&dir);
        Ok(from_pandoc_html(raw.trim()))
    }

    #[test]
    fn transforms_map_aiword_marks_to_pandoc_and_back() {
        let source = sample_document_html();
        let pandoc = to_pandoc_html(&source);
        assert!(pandoc.contains(r#"class="comment-start""#));
        assert!(pandoc.contains(r#"class="insertion""#));
        assert!(pandoc.contains(r#"class="deletion""#));
        assert!(pandoc.contains("footnote-ref"));
        assert!(!has_aiword_chrome(&pandoc));

        let restored = from_pandoc_html(&pandoc);
        assert!(restored.contains("data-comment-id=\"c1\""));
        assert!(restored.contains("data-insertion"));
        assert!(restored.contains("data-deletion"));
        assert!(restored.contains("data-kind=\"footnote\""));
        assert!(restored.contains("Footnote body"));
    }

    #[test]
    fn docx_round_trip_keeps_mapped_features_and_reports_page_setup_loss() {
        if pandoc_on_path().is_none() {
            eprintln!("skipped: Pandoc is not on the PATH");
            return;
        }
        let source = sample_document_html();
        let recovered = run_pandoc_docx_round_trip(&source).expect("pandoc round-trip");
        let report = analyze_round_trip(&recovered);
        let rendered = report.render();

        let report_path = std::env::temp_dir().join("aiword-docx-roundtrip.md");
        std::fs::write(&report_path, format!("{rendered}\n")).expect("write report");

        assert!(
            report.unexpected_losses().is_empty(),
            "unexpected losses:\n{rendered}\n\nrecovered:\n{recovered}"
        );
        assert!(
            !report
                .features
                .iter()
                .find(|item| item.name == "page setup")
                .unwrap()
                .kept,
            "page setup should be reported as lost"
        );
        assert!(
            !report
                .features
                .iter()
                .find(|item| item.name == "color")
                .unwrap()
                .kept,
            "color should be reported as lost (Pandoc limitation)"
        );
        assert!(Path::new(&report_path).is_file());
    }
}
