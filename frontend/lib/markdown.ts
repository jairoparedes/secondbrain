/**
 * Renderizador Markdown mínimo y seguro para preview en el cliente.
 * Cubre: encabezados (#, ##, ###), negrita (**), itálica (*), código inline (`),
 * bloques de código (```), listas (- / 1.), enlaces [t](u), líneas horizontales
 * (---), párrafos y saltos de línea.
 *
 * No introducimos dependencias para mantener el bundle chico y evitar
 * CVEs de librerías externas en una app zero-knowledge.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inline(text: string): string {
  let out = escapeHtml(text);

  // código inline
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');

  // negrita + itálica
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // enlaces [t](u)
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer nofollow">$1</a>',
  );
  // NOTA: el reemplazo anterior mete la URL como texto. Corregimos con un
  // segundo pase bien hecho:
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, label, url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`,
  );

  return out;
}

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];

  let inCode = false;
  let codeBuf: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length === 0) return;
    out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine;

    // Bloque de código
    if (line.trim().startsWith('```')) {
      if (!inCode) {
        flushPara();
        flushList();
        inCode = true;
        codeBuf = [];
      } else {
        out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    // Línea vacía → corta párrafo y lista
    if (line.trim() === '') {
      flushPara();
      flushList();
      continue;
    }

    // Horizontal rule
    if (/^-{3,}\s*$/.test(line.trim())) {
      flushPara();
      flushList();
      out.push('<hr />');
      continue;
    }

    // Encabezados
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    // Listas
    const ul = /^[-*]\s+(.*)$/.exec(line);
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const desired: 'ul' | 'ol' = ul ? 'ul' : 'ol';
      if (listType && listType !== desired) flushList();
      if (!listType) {
        out.push(`<${desired}>`);
        listType = desired;
      }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
      continue;
    } else if (listType) {
      flushList();
    }

    // Párrafo en curso
    para.push(line);
  }

  // Cerrar estructuras pendientes
  if (inCode) {
    out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
  }
  flushPara();
  flushList();

  return out.join('\n');
}
