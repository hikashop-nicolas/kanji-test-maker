# Test sentences for 漢字テストメーカー

How to use: copy the lines **inside a code block** (not the heading) and paste
them into the tool's text area, then click 解析する. Each block is one set, one
sentence per line. The tool auto-selects the kanji words; deselect the ones you
do not want to test.

---

## Set A, the sample lesson (絵・知・春・思)

Reproduces the provided sample. In the tool, deselect the known kanji you do not
test (for example 大, 人, 名, 先生) so only the lesson's kanji get boxes.

```
絵の具で、花の絵をかく。
春休みに、雪がふった。
絵画教室にかよう。
先生に知らせる。
知人と行列のできるレストランに行く。
桜は、春にさく。
小さいころの思い出。
思い出したことをノートに書く。
前のほうから、大きな犬をつれた人がやってくる。
元気よく、名前を言う。
```

## Set B, compound words (熟語)

Tests two-character compounds, the box should be 2 cells.

```
学校の図書室で本を読む。
電車に乗って駅まで行く。
今日の天気は晴れです。
理科の実験を楽しむ。
公園で友達と遊ぶ。
```

## Set C, okurigana (送りがな)

Words with kana tails, the box is sized to the whole word.

```
朝早く起きて顔を洗う。
新しい服を着る。
重い荷物を運ぶ。
野菜を細かく切る。
楽しい話を聞く。
```

## Set D, mixed target + known kanji

Each line has several kanji words; practice deselecting the ones you do not test.

```
大きな魚が川を泳ぐ。
人気のお店に毎日通う。
名前を大きな声で読む。
小学校の校庭を走る。
```

## Set E, reading test (use 読み mode)

Harder readings; switch these rows to 読み so the kanji stays and the box is for
the reading.

```
博士が研究を発表する。
紅葉が美しい季節になった。
建物の設計を担当する。
新幹線で出張に行く。
複雑な問題を解決する。
```

## Set F, edge cases

Katakana words, a number, and a longer sentence with multiple kanji words.

```
レストランでハンバーグを注文する。
今日は十月三日です。
お母さんと買い物に行って、果物を買った。
図書館で借りた本を、来週の月曜日までに返す。
```

## Quick smoke test (just a few lines)

```
春休みに、雪がふった。
絵画教室にかよう。
小さいころの思い出。
```
