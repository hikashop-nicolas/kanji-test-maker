const fs=require('fs');
const {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,WidthType,BorderStyle,TextDirection,PageOrientation,HeightRule,VerticalAlign}=require('docx');
const V=TextDirection.TOP_TO_BOTTOM_RIGHT_TO_LEFT;
const b=s=>({style:s?BorderStyle.SINGLE:BorderStyle.NONE,size:6,color:'222222'});
const bd=on=>({top:b(on),bottom:b(on),left:b(on),right:b(on)});
const t=x=>new TextRun({text:x,font:'Hiragino Mincho ProN',size:36});
// one row, explicit height; three vertical cells with explicit width
function cell(txt){return new TableCell({textDirection:V,verticalAlign:VerticalAlign.TOP,width:{size:1800,type:WidthType.DXA},borders:bd(false),
  children:[new Paragraph({children:[t(txt)]})]});}
const row=new TableRow({height:{value:9000,rule:HeightRule.ATLEAST},
  children:[cell('③かいがきょうしつにかよう。'),cell('②はるやすみに、ゆきがふった。'),cell('①えのぐで、はなのえをかく。')]});
const table=new Table({visuallyRightToLeft:true,width:{size:100,type:WidthType.PERCENTAGE},borders:bd(false),rows:[row]});
const doc=new Document({sections:[{properties:{page:{size:{orientation:PageOrientation.LANDSCAPE}}},children:[table]}]});
Packer.toBuffer(doc).then(buf=>{fs.writeFileSync('min.docx',buf);console.log('wrote min.docx '+buf.length);});
