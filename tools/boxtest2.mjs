import fs from 'fs'; import * as d from 'docx';
const V='TOP_TO_BOTTOM_RIGHT_TO_LEFT'; const f='Hiragino Mincho ProN';
const t=(s,e={})=>new d.TextRun({text:s,font:f,size:32,...e});
const box=(n)=>new d.TextRun({text:'　'.repeat(n),font:f,size:32,border:{style:d.BorderStyle.SINGLE,size:6,color:'222222',space:1}});
const none={style:d.BorderStyle.NONE,size:0,color:'FFFFFF'};const nb={top:none,bottom:none,left:none,right:none};
const cell=(kids)=>new d.TableCell({textDirection:d.TextDirection[V],verticalAlign:d.VerticalAlign.TOP,width:{size:1000,type:d.WidthType.DXA},borders:nb,margins:{top:60,bottom:60,left:60,right:60},children:[new d.Paragraph({children:kids})]});
// c_inline: underlined reading then box (the OLD pattern); c_break: text, linebreak, box
const cInline=cell([t('えのぐ',{underline:{type:d.UnderlineType.SINGLE}}),box(3)]);
const cBreak=cell([t('えのぐ',{underline:{type:d.UnderlineType.SINGLE}}),new d.TextRun({break:1}),box(3)]);
const cTab=cell([t('あ'),box(2),t('　'),box(2)]);
const label=cell([t('LBL')]);
const row=new d.TableRow({height:{value:6000,rule:d.HeightRule.ATLEAST},children:[cTab,cBreak,cInline,label]});
const doc=new d.Document({sections:[{properties:{page:{size:{orientation:d.PageOrientation.LANDSCAPE}}},children:[new d.Table({width:{size:100,type:d.WidthType.PERCENTAGE},borders:nb,rows:[row]})]}]});
d.Packer.toBuffer(doc).then(b=>{fs.writeFileSync('tools/boxtest2.docx',b);console.log('ok');});
