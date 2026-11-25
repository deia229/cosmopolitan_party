#!/usr/bin/env python3
"""Gera um orçamento em PDF (1 página A4) a partir de um ficheiro JSON.

Uso:  python3 gerar_orcamento.py exemplo-11235.json [saida.pdf]
Layout: cabeçalho com logo, dados do evento, tabelas por secção, notas e condições.
"""
import json, sys, os
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import mm

ROSE=colors.HexColor('#D4537E'); INK=colors.HexColor('#241A13'); MUT=colors.HexColor('#7a6f68'); LIGHT=colors.HexColor('#FBEFF3')
H=ParagraphStyle('h',fontName='Helvetica-Bold',fontSize=18,textColor=INK,leading=22)
S=ParagraphStyle('s',fontName='Helvetica',fontSize=10,textColor=MUT,leading=14)
H2=ParagraphStyle('h2',fontName='Helvetica-Bold',fontSize=12,textColor=ROSE,spaceBefore=6,spaceAfter=2)
B=ParagraphStyle('b',fontName='Helvetica',fontSize=8.5,textColor=INK,leading=11)
BB=ParagraphStyle('bb',parent=B,fontName='Helvetica-Bold')
N=ParagraphStyle('n',parent=B,textColor=MUT,leading=12)
R=ParagraphStyle('r',parent=B,alignment=2)
RB=ParagraphStyle('rb',parent=BB,alignment=2)

def cell(txt, right=False, bold=False):
    st = (RB if bold else R) if right else (BB if bold else B)
    return Paragraph(txt, st)

def tabela(rows, widths, align, header=True, total_rows=()):
    data=[]
    for i,row in enumerate(rows):
        head = header and i==0
        data.append([cell(c, right=(align[j]=='r'), bold=head or i in total_rows) for j,c in enumerate(row)])
    t=Table(data, colWidths=[w*mm for w in widths])
    st=[('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LINEBELOW',(0,0),(-1,-1),0.4,colors.HexColor('#e6dcd6')),
        ('TOPPADDING',(0,0),(-1,-1),2),('BOTTOMPADDING',(0,0),(-1,-1),2)]
    if header: st.append(('BACKGROUND',(0,0),(-1,0),LIGHT))
    for r in total_rows: st.append(('BACKGROUND',(0,r),(-1,r),LIGHT))
    t.setStyle(TableStyle(st)); return t

def main(cfg_path, out=None):
    base=os.path.dirname(os.path.abspath(cfg_path))
    c=json.load(open(cfg_path,encoding='utf-8'))
    out=out or os.path.join(base,c.get('saida','orcamento.pdf'))
    doc=SimpleDocTemplate(out,pagesize=A4,leftMargin=18*mm,rightMargin=18*mm,topMargin=7*mm,bottomMargin=6*mm,
                          title=c['titulo']+' – Cosmopolitan Party',author='Cosmopolitan Party')
    e=[]
    logo=Image(os.path.normpath(os.path.join(base,c['logo'])),width=18*mm,height=18*mm)
    head=Table([[logo,[Paragraph(c['titulo'],H),Paragraph(c['subtitulo'],S)]]],colWidths=[24*mm,150*mm])
    head.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(0,0),0)]))
    e+=[head,Spacer(1,8),tabela([[f'<b>{k}</b>',v] for k,v in c['info']],[35,139],['l','l'],header=False)]
    for sec in c['seccoes']:
        if sec.get('titulo'): e.append(Paragraph(sec['titulo'],H2))
        if sec.get('tabela'):
            t=sec['tabela']
            e.append(tabela(t['linhas'],t['larguras'],t['alinhamento'],t.get('cabecalho',True),t.get('destaque',[])))
        if sec.get('nota'): e+=[Spacer(1,2),Paragraph(sec['nota'],N)]
        if sec.get('negrito'): e+=[Spacer(1,2),Paragraph('<b>'+sec['negrito']+'</b>',B)]
        for b in sec.get('lista',[]): e+=[Paragraph('• '+b,B),Spacer(1,1)]
    doc.build(e); print(out)

if __name__=='__main__':
    if len(sys.argv)<2: sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv)>2 else None)
