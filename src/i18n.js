// Tiny i18n for the interface (ja / en / fr). The worksheet OUTPUT stays
// Japanese; only the app chrome translates. Static text is tagged in the HTML
// with data-i18n / data-i18n-ph / data-i18n-title; dynamic strings call t().
// The chosen language persists in localStorage.

export const LANGS = [
  { code: 'ja', name: '日本語' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
];

const STR = {
  appName: { ja: '漢字テストメーカー', en: 'Kanji Test Maker', fr: 'Créateur de tests de kanji' },

  // top bar
  save_set: { ja: 'セットを保存', en: 'Save set', fr: 'Enregistrer le jeu' },
  load_set: { ja: 'セットを読み込み', en: 'Load set', fr: 'Charger un jeu' },

  // header / option fields
  f_class: { ja: 'クラス', en: 'Class', fr: 'Classe' },
  f_title: { ja: 'タイトル', en: 'Title', fr: 'Titre' },
  f_number: { ja: '番号', en: 'Number', fr: 'Numéro' },
  f_name_label: { ja: '名前ラベル', en: 'Name label', fr: 'Étiquette « nom »' },
  f_per_page: { ja: '1ページの文数', en: 'Sentences per page', fr: 'Phrases par page' },
  f_font_size: { ja: '文字の大きさ (pt)', en: 'Font size (pt)', fr: 'Taille du texte (pt)' },
  f_box_size: { ja: 'マスの大きさ (mm)', en: 'Box size (mm)', fr: 'Taille des cases (mm)' },
  f_font: { ja: 'フォント', en: 'Font', fr: 'Police' },
  f_font_file: { ja: 'フォントファイル（PDF用）', en: 'Font file (for PDF)', fr: 'Fichier de police (PDF)' },
  f_extras: { ja: '点数・サイン欄', en: 'Score & seal boxes', fr: 'Cases note et signature' },
  f_extras_hint: { ja: '名前の下に追加', en: 'Add below the name', fr: 'Ajouter sous le nom' },
  f_image: { ja: '画像（左下）', en: 'Image (bottom-left)', fr: 'Image (en bas à gauche)' },
  btn_image_clear: { ja: '画像をクリア', en: 'Clear image', fr: "Effacer l'image" },
  alert_image_too_big: { ja: '画像が大きすぎて保存できません（今回は表示されます）。', en: 'Image too large to save (it still shows this time).', fr: "Image trop grande pour l'enregistrer (elle s'affiche quand même cette fois)." },
  og_google: { ja: 'Google Fonts', en: 'Google Fonts', fr: 'Polices Google' },
  og_system: { ja: 'システム', en: 'System', fr: 'Système' },
  opt_klee: { ja: 'Klee One（おすすめ・手書きふう）', en: 'Klee One (recommended · handwriting)', fr: 'Klee One (recommandé · manuscrit)' },
  opt_zenmaru: { ja: 'Zen Maru Gothic（丸ゴ）', en: 'Zen Maru Gothic (rounded)', fr: 'Zen Maru Gothic (arrondi)' },
  opt_kaisei: { ja: 'Kaisei Tokumin（明朝）', en: 'Kaisei Tokumin (Mincho)', fr: 'Kaisei Tokumin (Mincho)' },
  opt_yuji: { ja: 'Yuji Syuku（筆）', en: 'Yuji Syuku (brush)', fr: 'Yuji Syuku (pinceau)' },
  opt_hira_mincho: { ja: 'ヒラギノ明朝', en: 'Hiragino Mincho', fr: 'Hiragino Mincho' },
  opt_hira_kaku: { ja: 'ヒラギノ角ゴ', en: 'Hiragino Kaku Gothic', fr: 'Hiragino Kaku Gothic' },
  opt_yumincho: { ja: '游明朝', en: 'Yu Mincho', fr: 'Yu Mincho' },
  opt_yugothic: { ja: '游ゴシック', en: 'Yu Gothic', fr: 'Yu Gothic' },

  // lesson panel
  lbl_pick_grade: { ja: '学年・JLPT から漢字を選ぶ', en: 'Pick kanji by grade or JLPT', fr: 'Choisir les kanji par niveau ou JLPT' },
  grade_placeholder: { ja: '— レベルを選ぶ —', en: '— Pick a level —', fr: '— Choisir un niveau —' },
  og_school: { ja: '学年', en: 'School grade', fr: 'Niveau scolaire' },
  og_jlpt: { ja: 'JLPT（日本語能力試験・目安）', en: 'JLPT (proficiency, approx.)', fr: 'JLPT (niveau, approx.)' },
  grade_1: { ja: '小1', en: 'Grade 1', fr: 'Niveau 1' },
  grade_2: { ja: '小2', en: 'Grade 2', fr: 'Niveau 2' },
  grade_3: { ja: '小3', en: 'Grade 3', fr: 'Niveau 3' },
  grade_4: { ja: '小4', en: 'Grade 4', fr: 'Niveau 4' },
  grade_5: { ja: '小5', en: 'Grade 5', fr: 'Niveau 5' },
  grade_6: { ja: '小6', en: 'Grade 6', fr: 'Niveau 6' },
  grade_secondary: { ja: '中学以降（常用漢字）', en: 'Secondary (jōyō)', fr: 'Collège et + (jōyō)' },
  ph_lesson_field: {
    ja: '学年を選んで表から選ぶか、ここに漢字を直接入力します（例：花 空 字）',
    en: 'Pick a grade and choose from the table, or type kanji here (e.g. 花 空 字)',
    fr: 'Choisissez un niveau et sélectionnez dans le tableau, ou saisissez des kanji ici (ex. 花 空 字)',
  },
  lbl_week_kanji: { ja: '今週の漢字', en: "This week's kanji", fr: 'Kanji de la semaine' },
  hint_week_kanji: { ja: '（表をクリック、または直接入力・追加できます）', en: '(click the table, or type/add directly)', fr: '(cliquez le tableau, ou saisissez directement)' },
  btn_find: { ja: '選んだ漢字で例文をさがす', en: 'Find sentences for the chosen kanji', fr: 'Chercher des phrases pour ces kanji' },
  btn_finding: { ja: 'さがしています…', en: 'Searching…', fr: 'Recherche…' },
  btn_clear: { ja: '選択をクリア', en: 'Clear selection', fr: 'Effacer la sélection' },

  // picker
  lbl_pick_sentences: { ja: '例文をえらぶ', en: 'Pick sentences', fr: 'Choisir les phrases' },
  chk_easy_only: { ja: 'やさしい文だけ（レベル以下の漢字）', en: 'Easy sentences only (kanji at/below the level)', fr: 'Phrases faciles seulement (kanji du niveau ou moins)' },
  btn_add_checked: { ja: 'チェックした文を追加', en: 'Add checked sentences', fr: 'Ajouter les phrases cochées' },
  hint_add: {
    ja: 'チェックした文が下の表に入り、語の選択・読み・書き／読みを調整できます。',
    en: 'Checked sentences go into the table below, where you can adjust word selection, readings, and write/read.',
    fr: 'Les phrases cochées vont dans le tableau ci-dessous, où vous pouvez ajuster la sélection, les lectures et écrire/lire.',
  },
  pick_summary: { ja: '{kanji}字・{sent}文（レベル：{grade}）', en: '{kanji} kanji · {sent} sentences (level: {grade})', fr: '{kanji} kanji · {sent} phrases (niveau : {grade})' },
  empty_not_jouyou: { ja: '常用漢字ではないため例文がありません。', en: 'Not a jōyō kanji, so no example sentences.', fr: 'Pas un kanji jōyō, donc aucune phrase.' },
  empty_none: { ja: '条件に合う例文が見つかりませんでした。', en: 'No matching sentences found.', fr: 'Aucune phrase correspondante.' },
  grade_secondary_short: { ja: '中学以降', en: 'Secondary', fr: 'Collège+' },
  grade_short: { ja: '小{n}', en: 'Grade {n}', fr: 'Niveau {n}' },

  // paste panel
  lbl_paste: { ja: '文を貼り付け（1行に1文）', en: 'Paste sentences (one per line)', fr: 'Coller des phrases (une par ligne)' },
  btn_process: { ja: '解析する', en: 'Analyze', fr: 'Analyser' },
  hint_process: { ja: '漢字の語が自動で選択されます。語をクリックして選択／解除。', en: 'Kanji words are auto-selected. Click a word to toggle.', fr: 'Les mots en kanji sont sélectionnés automatiquement. Cliquez pour (dé)sélectionner.' },

  // legend + table
  legend_intro: { ja: '語をクリックして切り替え：', en: 'Click a word to cycle:', fr: 'Cliquez un mot pour changer :' },
  legend_plain: { ja: 'そのまま', en: 'Plain', fr: 'Tel quel' },
  legend_test: { ja: 'テスト（マス）', en: 'Test (box)', fr: 'Test (case)' },
  legend_furigana: { ja: 'ふりがな', en: 'Furigana', fr: 'Furigana' },
  legend_kana: { ja: 'ひらがなに置換', en: 'Replace with kana', fr: 'Remplacer par kana' },
  th_mode: { ja: 'モード', en: 'Mode', fr: 'Mode' },
  th_sentence: { ja: '文（語をクリックで状態を切り替え）', en: 'Sentence (click a word to change its state)', fr: 'Phrase (cliquez un mot pour changer son état)' },

  // export toolbar
  btn_preview: { ja: 'プレビュー更新', en: 'Update preview', fr: "Actualiser l'aperçu" },
  btn_pdf: { ja: 'PDF を保存', en: 'Save PDF', fr: 'Enregistrer le PDF' },
  btn_docx: { ja: 'Word (.docx) を保存', en: 'Save Word (.docx)', fr: 'Enregistrer Word (.docx)' },
  chk_answer: { ja: '解答シートも作成する', en: 'Also make an answer sheet', fr: 'Créer aussi un corrigé' },
  btn_pdf_ans: { ja: '解答 PDF', en: 'Answer PDF', fr: 'Corrigé PDF' },
  btn_docx_ans: { ja: '解答 Word (.docx)', en: 'Answer Word (.docx)', fr: 'Corrigé Word (.docx)' },
  lbl_preview: { ja: 'プレビュー', en: 'Preview', fr: 'Aperçu' },

  // mode buttons + per-word states + misc dynamic
  mode_kaki: { ja: '書き', en: 'Write', fr: 'Écrire' },
  mode_yomi: { ja: '読み', en: 'Read', fr: 'Lire' },
  st_plain: { ja: 'そのまま（漢字）', en: 'Plain (kanji)', fr: 'Tel quel (kanji)' },
  st_test: { ja: 'テスト（マス）', en: 'Test (box)', fr: 'Test (case)' },
  st_furigana: { ja: 'ふりがなを付ける', en: 'Add furigana', fr: 'Ajouter furigana' },
  st_kana: { ja: 'ひらがなにする', en: 'Make hiragana', fr: 'Mettre en hiragana' },
  lbl_reading: { ja: 'よみ', en: 'reading', fr: 'lecture' },
  count: { ja: '（{n}）', en: '({n})', fr: '({n})' },
  strokes: { ja: '{n}画', en: '{n} strokes', fr: '{n} traits' },

  // status + alerts + footer
  status_loading: { ja: '辞書を読み込み中…', en: 'Loading dictionary…', fr: 'Chargement du dictionnaire…' },
  status_failed: { ja: '辞書の読み込みに失敗しました', en: 'Failed to load the dictionary', fr: 'Échec du chargement du dictionnaire' },
  alert_load_failed: { ja: '読み込みに失敗しました（JSONではありません）', en: 'Load failed (not JSON)', fr: 'Échec du chargement (pas du JSON)' },
  footer_kanji_data: { ja: '漢字データ', en: 'Kanji data', fr: 'Données kanji' },
  footer_examples: { ja: '例文', en: 'Example sentences', fr: "Phrases d'exemple" },
  lang_label: { ja: '言語', en: 'Language', fr: 'Langue' },
};

let lang = 'ja';

export function getLang() { return lang; }

export function setLang(l) {
  lang = LANGS.some(x => x.code === l) ? l : 'ja';
  try { localStorage.setItem('ktm_lang', lang); } catch (e) {}
  document.documentElement.lang = lang;
}

// pick the stored language, else the browser's, else Japanese
export function initLang() {
  let stored; try { stored = localStorage.getItem('ktm_lang'); } catch (e) {}
  if (stored && LANGS.some(x => x.code === stored)) lang = stored;
  else { const n = (navigator.language || 'ja').slice(0, 2); lang = LANGS.some(x => x.code === n) ? n : 'ja'; }
  document.documentElement.lang = lang;
  return lang;
}

export function t(key, vars) {
  let s = (STR[key] && (STR[key][lang] ?? STR[key].ja)) ?? key;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}

// apply all tagged static strings under root
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
  root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
  root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.getAttribute('data-i18n-title')); });
  root.querySelectorAll('[data-i18n-label]').forEach(el => { el.label = t(el.getAttribute('data-i18n-label')); });
  if (root === document) document.title = t('appName');
}
