// A compact syntax highlighter for code blocks: comments, strings, numbers, keywords, types and
// function names, with per-language comment styles and keyword lists. It returns DOM nodes
// (text in spans), so code is never parsed as HTML.

type Lang = { keywords: Set<string>; line: string[]; block: [string, string][]; backtick: boolean }

const words = (list: string) => new Set(list.split(/\s+/).filter(Boolean))

const C_LIKE =
  'if else for while do switch case default break continue return function const let var new delete typeof ' +
  'instanceof in of class extends super this null undefined true false try catch finally throw async await ' +
  'yield import export from as static public private protected readonly interface type enum implements ' +
  'void namespace declare abstract keyof infer satisfies get set'
const LANGS: Record<string, Lang> = {
  js: { keywords: words(C_LIKE), line: ['//'], block: [['/*', '*/']], backtick: true },
  py: {
    keywords: words(
      'def class return if elif else for while in not and or is None True False import from as with try ' +
        'except finally raise lambda yield pass break continue global nonlocal async await assert del match case self'
    ),
    line: ['#'],
    block: [],
    backtick: false
  },
  sh: {
    keywords: words('if then else elif fi for while do done case esac function in return export local echo exit set unset source'),
    line: ['#'],
    block: [],
    backtick: false
  },
  rust: {
    keywords: words(
      'fn let mut pub struct enum impl trait use mod crate self Self super match if else for while loop return ' +
        'break continue as where move ref const static unsafe async await dyn true false Some None Ok Err'
    ),
    line: ['//'],
    block: [['/*', '*/']],
    backtick: false
  },
  go: {
    keywords: words(
      'func package import var const type struct interface map chan go defer select return if else for range ' +
        'switch case default break continue fallthrough nil true false'
    ),
    line: ['//'],
    block: [['/*', '*/']],
    backtick: true
  },
  java: {
    keywords: words(
      C_LIKE + ' package final synchronized throws boolean int long double float char byte short fun val when object data sealed override open internal'
    ),
    line: ['//'],
    block: [['/*', '*/']],
    backtick: false
  },
  c: {
    keywords: words(
      'if else for while do switch case default break continue return struct union enum typedef static const ' +
        'extern void int long short char float double unsigned signed sizeof auto namespace class public private ' +
        'protected template typename virtual override new delete nullptr true false using include define'
    ),
    line: ['//'],
    block: [['/*', '*/']],
    backtick: false
  },
  sql: {
    keywords: words(
      'select from where and or not insert into values update set delete create table index view drop alter ' +
        'join left right inner outer on group by order having limit offset as distinct null is in like ' +
        'SELECT FROM WHERE AND OR NOT INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE JOIN ON GROUP BY ORDER LIMIT AS NULL'
    ),
    line: ['--'],
    block: [['/*', '*/']],
    backtick: false
  },
  css: { keywords: words('important media import from to'), line: [], block: [['/*', '*/']], backtick: false },
  html: { keywords: words(''), line: [], block: [['<!--', '-->']], backtick: false },
  json: { keywords: words('true false null'), line: [], block: [], backtick: false },
  yaml: { keywords: words('true false null yes no on off'), line: ['#'], block: [], backtick: false },
  text: { keywords: words(''), line: [], block: [], backtick: false }
}

const ALIASES: Record<string, string> = {
  javascript: 'js', jsx: 'js', ts: 'js', tsx: 'js', typescript: 'js', mjs: 'js', cjs: 'js',
  python: 'py', bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh', powershell: 'sh', ps1: 'sh',
  rs: 'rust', golang: 'go', kotlin: 'java', kt: 'java', csharp: 'java', cs: 'java', swift: 'java',
  cpp: 'c', 'c++': 'c', h: 'c', hpp: 'c', xml: 'html', svg: 'html', vue: 'html', scss: 'css', less: 'css',
  yml: 'yaml', toml: 'yaml', ini: 'yaml', jsonc: 'json', diff: 'text', plaintext: 'text', txt: 'text', md: 'text', markdown: 'text'
}

function langFor(name: string): Lang {
  const key = ALIASES[name] ?? name
  return LANGS[key] ?? LANGS.js ?? { keywords: new Set(), line: [], block: [], backtick: false }
}

function span(className: string, text: string): HTMLSpanElement {
  const node = document.createElement('span')
  node.className = className
  node.textContent = text
  return node
}

/** Highlighted code as a fragment. */
export function highlight(code: string, language: string): DocumentFragment {
  const fragment = document.createDocumentFragment()
  if (language === 'diff') {
    for (const line of code.split('\n')) {
      const cls = line.startsWith('+') ? 'tok-add' : line.startsWith('-') ? 'tok-del' : line.startsWith('@@') ? 'tok-k' : ''
      fragment.append(cls ? span(cls, line) : line, '\n')
    }
    fragment.lastChild?.remove()
    return fragment
  }
  const lang = langFor(language)
  let plain = ''
  const flush = () => {
    if (plain) {
      fragment.append(plain)
      plain = ''
    }
  }
  let i = 0
  const n = code.length
  outer: while (i < n) {
    const rest = code.startsWith.bind(code)
    for (const [open, close] of lang.block) {
      if (rest(open, i)) {
        const end = code.indexOf(close, i + open.length)
        const stop = end < 0 ? n : end + close.length
        flush()
        fragment.append(span('tok-c', code.slice(i, stop)))
        i = stop
        continue outer
      }
    }
    for (const marker of lang.line) {
      if (rest(marker, i) && (marker !== '#' || i === 0 || /[\s;(]/.test(code[i - 1] ?? ''))) {
        const end = code.indexOf('\n', i)
        const stop = end < 0 ? n : end
        flush()
        fragment.append(span('tok-c', code.slice(i, stop)))
        i = stop
        continue outer
      }
    }
    const ch = code[i] ?? ''
    if (ch === '"' || ch === "'" || (ch === '`' && lang.backtick)) {
      let j = i + 1
      while (j < n && code[j] !== ch) {
        if (code[j] === '\\') {
          j += 1
        }
        if (code[j] === '\n' && ch !== '`') {
          break
        }
        j += 1
      }
      flush()
      const isKey = language.startsWith('json') && /^\s*:/.test(code.slice(j + 1, j + 3))
      fragment.append(span(isKey ? 'tok-p' : 'tok-s', code.slice(i, j + 1)))
      i = j + 1
      continue
    }
    if (/[0-9]/.test(ch) && !/[A-Za-z_$]/.test(code[i - 1] ?? '')) {
      const match = /^(0x[0-9a-fA-F_]+|\d[\d_]*(\.\d+)?([eE][+-]?\d+)?)/.exec(code.slice(i))
      if (match) {
        flush()
        fragment.append(span('tok-n', match[0]))
        i += match[0].length
        continue
      }
    }
    if (/[A-Za-z_$@]/.test(ch)) {
      const match = /^[A-Za-z_$@][\w$-]*/.exec(code.slice(i))
      const word = match ? match[0].replace(/-+$/, '') : ch
      const clean = lang === LANGS.css || lang === LANGS.html || lang === LANGS.yaml ? word : word.replace(/-.*$/, '')
      flush()
      if (lang.keywords.has(clean)) {
        fragment.append(span('tok-k', clean))
      } else if (code[i + clean.length] === '(') {
        fragment.append(span('tok-f', clean))
      } else if (/^[A-Z][a-z0-9]/.test(clean)) {
        fragment.append(span('tok-t', clean))
      } else if ((lang === LANGS.yaml && /^\s*:/.test(code.slice(i + clean.length))) || (lang === LANGS.html && code[i - 1] === '<')) {
        fragment.append(span('tok-p', clean))
      } else {
        plain += clean
      }
      i += clean.length
      continue
    }
    plain += ch
    i += 1
  }
  flush()
  return fragment
}
