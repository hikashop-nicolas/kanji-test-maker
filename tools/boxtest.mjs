import fs from 'fs'; import * as d from 'docx';
const V='TOP_TO_BOTTOM_RIGHT_TO_LEFT';
const f='Hiragino Mincho ProN';
const t=(s,e={})=>new d.TextRun({text:s,font:f,size:32,...e});
const box=(n)=>new d.TextRun({text:'　'.repeat(n),font:f,size:32,border:{style:d.BorderStyle.SINGLE,size:6,color:'222222',space:1}});
const none={style:d.BorderStyle.NONE,size:0,color:'FFFFFF'};const nb={top:none,bottom:none,left:none,right:none};
const cell=(kids,w)=>new d.TableCell({textDirection:d.TextDirection[V],verticalAlign:d.VerticalAlign.TOP,width:{size:w,type:d.WidthType.DXA},borders:nb,margins:{top:60,bottom:60,left:60,right:60},children:kids});
// three box cells: no offset, small offset, larger offset
const c1=cell([new d.Paragraph({children:[box(2)]})],800);
const c2=cell([new d.Paragraph({children:[t('　　　'),box(2)]})],800);
const c3=cell([new d.Paragraph({children:[t('あ'),box(2),t('　　'),box(3)]})],800);
const label=cell([new d.Paragraph({children:[t('ラベル')]})],800);
const row=new d.TableRow({height:{value:6000,rule:d.HeightRule.ATLEAST},children:[c3,c2,c1,label]});
const table=new d.Table({width:{size:100,type:d.WidthType.PERCENTAGE},borders:nb,rows:[row]});
const doc=new d.Document({sections:[{properties:{page:{size:{orientation:d.PageOrientation.LANDSCAPE}}},children:[table]}]});
d.Packer.toBuffer(doc).then(b=>{fs.writeFileSync('tools/boxtest.docx',b);console.log('ok');});
