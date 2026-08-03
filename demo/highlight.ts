/* Syntax colouring for the code samples on this page. A page that advertises
   no dependencies should not pull in a highlighter to show four snippets, so
   this is a ~40-line tokeniser: at each position, the first rule that matches
   wins, anything nothing matches accumulates as plain text. Good enough for
   fixed, hand-written samples — it is not a parser and does not pretend to be. */

type Rule = [cls: string, re: RegExp];

/* Rules are tried in order, so the greedy, unambiguous things (comments,
   strings) have to come before the things that could eat into them. Every
   pattern is sticky — it only ever matches at the cursor. */
const LANGS: Record<string, Rule[]> = {
	js: [
		['com', /\/\/[^\n]*|\/\*[\s\S]*?\*\//y],
		['str', /'[^'\n]*'|"[^"\n]*"|`[^`]*`/y],
		['key', /\b(?:import|export|from|const|let|var|function|return|new|await|async|if|else|true|false|null|undefined)\b/y],
		['num', /\b\d+(?:\.\d+)?\b/y],
		['prop', /[A-Za-z_$][\w$]*(?=\s*:)/y],
		['fn', /[A-Za-z_$][\w$]*(?=\s*\()/y],
		['op', /=>|[=+\-*/<>?!|&]+/y],
		['punc', /[{}()[\];,.]/y]
	],
	html: [
		['com', /<!--[\s\S]*?-->/y],
		['tag', /<\/?[A-Za-z][\w-]*|\/?>/y],
		['attr', /[A-Za-z_:][\w:.-]*(?=\s*=|\s*\/?>)/y],
		['str', /"[^"\n]*"|'[^'\n]*'/y],
		['op', /=/y]
	],
	css: [
		['com', /\/\*[\s\S]*?\*\//y],
		['str', /'[^'\n]*'|"[^"\n]*"/y],
		['attr', /--[\w-]+/y],
		['prop', /[a-z-]+(?=\s*:)/y],
		['fn', /[A-Za-z-]+(?=\()/y],
		['sel', /[.#][A-Za-z_-][\w-]*/y],
		['num', /\b\d+(?:\.\d+)?(?:px|rem|em|%|s|ms|deg)?\b/y],
		['punc', /[{}();:,]/y]
	],
	// the projection maths: an expression, then prose pushed out to a column
	math: [
		['com', / {2,}\S[^\n]*/y],
		['num', /\b\d+(?:\.\d+)?\b/y],
		['prop', /[A-Za-zΔ][\w]*/y],
		['op', /[=+\-*/·]/y],
		['punc', /[()]/y]
	]
};

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function paint(src: string, rules: Rule[]): string {
	let out = '';
	let plain = '';
	let i = 0;

	while (i < src.length) {
		let hit: [string, string] | null = null;

		for (const [cls, re] of rules) {
			re.lastIndex = i;
			const m = re.exec(src);
			if (m && m[0]) {
				hit = [cls, m[0]];
				break;
			}
		}

		if (!hit) {
			plain += src[i++];
			continue;
		}

		if (plain) {
			out += escape(plain);
			plain = '';
		}
		out += `<span class="t-${hit[0]}">${escape(hit[1])}</span>`;
		i += hit[1].length;
	}

	return out + escape(plain);
}

/* Reads textContent, so the entities in the source markup are already back to
   plain characters by the time we see them, and everything is re-escaped on
   the way out. */
export function highlightAll(root: ParentNode = document): void {
	for (const el of root.querySelectorAll<HTMLElement>('pre[data-lang]')) {
		const rules = LANGS[el.dataset.lang!];
		if (rules) el.innerHTML = paint(el.textContent ?? '', rules);
	}
}
