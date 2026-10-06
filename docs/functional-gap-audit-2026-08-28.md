# Auditoria funcional do Shakstory — 2026-08-28

## Conclusão executiva

A crítica do autor é válida. O estado publicado possui uma casca de estúdio, alguns contratos de dados e testes isolados, mas ainda não entrega a experiência integrada de um editor profissional. Há rótulos para Biblioteca, Planejar, Manuscrito e Preparar, porém a paridade precisa ser medida por fluxos completos: criar um projeto, estruturar capítulos/cenas, escrever com formatação, reorganizar, definir metas, preparar front matter/body/back matter, visualizar em dispositivos e exportar sem perder a estrutura.

## Referências funcionais

A página oficial do Novelist descreve projetos/livros, quadro de planejamento, personagens e lugares, cenas e capítulos, metas, editor rich text com comentários/autosave/contadores/histórico, preview integrado, templates e backup/restore [1].

A documentação oficial do Kindle Create descreve importação de DOC/DOCX, detecção e aceitação de títulos de capítulos, organização em Front Matter/Body/Back Matter, divisão/união/reordenação, páginas pré-formatadas, sumário interativo, estilos de capítulo, temas, imagens, hyperlinks, configurações de impressão, preview por dispositivo e exportação KPF [2].

A página oficial do Atticus descreve editor com arrastar e soltar capítulos, metas e contador/hábito de escrita, importação, temas customizáveis, preview para vários dispositivos, exportação EPUB/PDF/DOCX, volumes/partes, imagens full bleed, notas de rodapé, H2–H6, temas de capítulo, backups e funcionamento offline [3].

## Lacunas que bloqueiam a aceitação

| Área | Aceitação verificável necessária | Estado auditado |
|---|---|---|
| Biblioteca | Criar/abrir/renomear/duplicar/excluir/resetar livro; cards com título, autor, ISBN, status, páginas, capítulos, caracteres, tempo, último ponto; busca/filtro/ordenação. | Parcial; a tela vazia existe, mas o fluxo precisa ser exercitado como produto integrado. |
| Navegação | Menu contextual retrátil, breadcrumb, atalhos, painel lateral não intrusivo e retorno claro entre Biblioteca, Projeto, Planejar, Manuscrito e Preparar. | Parcial; rótulos existem, mas a usabilidade precisa ser comprovada em fluxo real. |
| Manuscrito | Árvore de partes/capítulos/cenas, drag-and-drop/reordenação, duplicar, excluir, títulos editáveis, divisão/união de cenas, blocos e busca/substituição. | Parcial; o editor estrutural não equivale ainda a uma experiência de escrita contínua. |
| Escrita | Rich text operacional com estilos de parágrafo, títulos H1–H6, negrito/itálico/sublinhado, links, imagem, separador, citação, lista, alinhamento, undo/redo, contagem e metas. | Parcial; toolbar e testes existem, mas faltam verificações de todos os comandos no fluxo real. |
| Planejamento | CRUD real de personagens, locais, eventos, objetivos, conflitos, cenas, relações, notas, tags/imagens e status; ligação entre entidades e manuscrito. | Parcial; CRUDs isolados existem, mas o modelo precisa oferecer descoberta e vínculos em uso real. |
| Preparação | Front matter/body/back matter, folha de rosto, copyright, dedicação, sumário HTML/interativo, prefácio, sobre o autor, páginas e cabeçalhos/rodapés. | Insuficiente; metadados e preview não substituem um Book Builder. |
| Diagramação | Presets e tema customizável, tamanho de trim, margens, fonte, espaçamento, drop cap, separadores, imagens, viúvas/órfãs e preview de dispositivos. | Parcial; presets existem, mas faltam controles editoriais completos e preview por dispositivo. |
| Exportação | EPUB refluível, PDF de impressão, DOCX editável, TXT/HTML, preservação de sumário, capa, links, estilos, front/back matter e relatório de validação. | Parcial; exportadores existem, mas a aceitação exige round-trip e inspeção dos arquivos gerados. |
| Recuperação | Autosave local e remoto, backup/restore exportável, histórico de snapshots, conflito visível, reabertura em projeto/nó/ponto exatos. | Parcial; recovery local e SHA existem; histórico visual e backup de usuário precisam ser expostos. |

## Decisão de reconstrução

A próxima implementação deve priorizar a experiência integrada sobre novos módulos periféricos. A proteção KicomAV fica congelada em segundo plano até o editor cumprir os fluxos acima, pois segurança de upload não compensa uma experiência editorial incompleta. Nenhuma cópia de dados reais do autor deve ser usada nos testes; todos os cenários destrutivos usarão fixtures QA isoladas.

## Referências

[1]: https://www.novelist.app/ "Novelist — Write your novels"
[2]: https://kdp.amazon.com/help/topic/GYVL2CASGU9ACFVU "Kindle Create Tutorial — KDP Help"
[3]: https://www.atticus.io/ "Atticus — Write and Format Stunning Books"

## Auditoria visual do shell

A captura desktop e a captura mobile do preview mostraram um cabeçalho com menu hambúrguer, Biblioteca, Projeto, Manuscrito, Planejar, Preparar e Segurança; no mobile, o menu fica recolhido e o conteúdo permanece legível sem overflow horizontal. A Biblioteca vazia apresenta Novo livro, busca e estado inicial. Isso confirma que a navegação existe no shell publicado; a crítica de ausência pode estar relacionada à sessão/estado visual anterior ou ao fato de o usuário ainda não ter aberto um projeto. A lacuna funcional permanece: a aceitação precisa ser verificada depois de criar um livro e executar os fluxos internos, não apenas pela existência dos rótulos.

A última captura usada para essa auditoria corresponde ao estado de desenvolvimento `9a98de1e`; mudanças posteriores do Book Builder e da toolbar devem ser validadas em novo checkpoint.
