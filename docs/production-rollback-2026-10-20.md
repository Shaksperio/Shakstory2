# Ponto de restauração da produção — 2026-10-20

Worker: `shakstory` (Cloudflare account `e31728d760beddc69617fbdb81c5e007`).
Deployment antes das próximas mudanças: `54c1135f-0bd7-4fc5-8eee-c4acc216730a`.
Versão implantada a 100%: `d7f113c6-ddb3-4553-b776-492d13c5b4a2` (Worker Version 14).
D1 binding `DB`: `shakstory-pilot`, UUID `b2c9c84a-0ff2-4d7f-8b17-e1046149af4a`.
Export SQL D1 via API concluído no bookmark `0000009d-00000000-0000510a-53d0551dd3e001af659fe88aaf8cca81`.
Arquivo exportado: `b2c9c84a-0ff2-4d7f-8b17-e1046149af4a-0000009d-00000000-0000510a-53d0551dd3e001af659fe88aaf8cca81.sql` (armazenamento temporário Cloudflare; ainda não retido em backup privado).
Não incluir signed_url temporária no GitHub nem credenciais nos commits.
Antes de alterar o Worker, D1 continha 30 documentos editoriais, somando 1.454.633 bytes de `data_json`.

## Restaurar o código do Worker

No painel Cloudflare, Workers & Pages → `shakstory` → Deployments/Versions → selecionar a versão `d7f113c6-ddb3-4553-b776-492d13c5b4a2` e restaurar com 100% do tráfego. Alternativamente, usar POST `/accounts/{account_id}/workers/scripts/shakstory/deployments` com `strategy: percentage` e `versions:[{version_id: ..., percentage:100}]`. Conferir bindings após restauração.

## Restaurar o D1

A exportação SQL foi solicitada e concluída no serviço Cloudflare. **O arquivo ainda precisa ser baixado e guardado em local privado e durável**, pois o link assinado expira. Não é correto tratar um URL temporário como backup retido. O bookmark Time Travel permite investigar restauração no D1, mas restaurar o banco inteiro pode sobrescrever escritas feitas depois do ponto de retorno. Antes de restaurar: interromper novas escritas, criar nova exportação, comparar documentos por SHA e restaurar seletivamente quando possível. Nunca fazer Time Travel restore automático em produção.

## Limites

O backup D1 não cobre necessariamente dados Firestore/Storage externos. Recuperação fim a fim exige backups e testes separados desses sistemas. Este documento não contém conteúdo de manuscritos nem tokens.
