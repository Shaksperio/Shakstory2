# Autoria e procedência (marco 1)

- **O que faz:** o autor ativa o Google Authenticator (TOTP) e, com o código, registra versões de um livro ("Autoria" no card do livro em Minha conta). Cada registro guarda o SHA-256 do livro **como está no servidor** (`library.json` da conta), a data do servidor e o hash do registro anterior (cadeia). `GET /api/xuri/history` reconfere a cadeia.
- **O que não faz:** não bloqueia edição nem salvamento (o guardião nunca bloqueia escrita). Não é certidão de autoria nem prova quem escreveu. A data é a do servidor, sem carimbo externo.
- **Segurança:** segredo TOTP cifrado (AES-GCM) com o segredo `XURI_KEY` do Worker; cada código vale uma vez; 5 erros travam por 10 min; 8 códigos de recuperação guardados só em hash; janela de 15 min depois de um código válido.
- **Ativação em produção:** criar o secret `XURI_KEY` no Worker (32+ caracteres aleatórios). Sem ele as rotas respondem 503.
- **Carimbo de tempo externo (RFC 3161):** ao registrar, o Worker pede um carimbo do hash da entrada a uma autoridade (padrão `https://freetsa.org/tsr`, troque com o secret/variável `XURI_TSA_URL`). Falha não impede o registro; "Carimbar pendentes" repete. O token fica em `ts_proof`. `GET /api/xuri/dossier?bookId=` entrega o dossiê (JSON) com `entryPayload` e token para conferir fora do Shakstory (`openssl ts -verify`). O Worker valida a estrutura DER externa, o status concedido e a presença de um ContentInfo SignedData, mas não valida a assinatura do token, a cadeia de certificados nem o TSTInfo. Portanto, a presença de `timestamp` significa apenas que uma resposta passou por essa checagem estrutural; a validação criptográfica completa continua externa com OpenSSL e um certificado confiável.
- **Assinatura do autor (Ed25519):** opcional. A chave é criada no navegador, a privada fica cifrada neste aparelho (PBKDF2 + AES-GCM, frase-senha) e há arquivo de backup; o servidor guarda só a pública (`shak_keys`). Com chave ativa, o registro só vale assinado: `POST /api/xuri/prepare` devolve o texto exato (`entryPayload`) e a data; o navegador assina; `POST /api/xuri/register` confere a assinatura (data a no máximo 5 min do servidor e nunca anterior ao registro anterior). Sem a frase-senha e sem o backup a chave não se recupera. Revogar a chave exige o código do autenticador e não apaga as assinaturas antigas. O dossiê traz a chave pública em SPKI e como conferir com `openssl pkeyutl -verify -rawin`.
- **Passaporte X-URI v1:** a página `/verificar/xuri` aceita o JSON baixado em **Dossiê** e verifica no próprio navegador o hash SHA-256 de cada `entryPayload`, os elos da cadeia e as assinaturas Ed25519 com as chaves públicas incluídas. O arquivo não é enviado ao servidor e a rota de verificação não exige login. O verificador diferencia dossiê sem assinatura, assinatura válida, inválida e não verificável; também mostra a revogação atual da chave separadamente da validade matemática de uma assinatura histórica. O resultado não valida criptograficamente o token RFC 3161: isso continua sendo feito externamente com OpenSSL e um certificado confiável. O dossiê contém o e-mail da conta; confira-o antes de compartilhar o arquivo. O manifesto não contém o livro integral, portanto para conferir o `contentHash` é necessário conservar o livro e reproduzir a serialização JSON estável usada pelo servidor. O resultado não é certidão de autoria nem prova de identidade civil.
- **Ainda não feito:** backup opcional no Drive, ICP-Brasil e OpenTimestamps.

## Consulta pública (2026-10-24.1)

O autor decide, obra por obra, se o registro pode ser consultado sem login (botão "Publicar para consulta" no diálogo Autoria, com a janela do autenticador aberta). Qualquer pessoa consulta pelo UID da obra, UID da versão ou SHA-256 em `/verificar/xuri`. A resposta é uma lista fechada de campos: título, nome público opcional, hashes, `entryPayload`, assinaturas, chaves públicas e carimbos. Nunca saem e-mail da conta, notas, segredos do autenticador ou o texto da obra. "Tornar privada" remove a obra da consulta na hora. O resultado é evidência técnica de que o conteúdo existia na data registrada; não prova autoria jurídica nem originalidade.

## Prova de exportação (2026-10-24.2)

Depois de exportar o livro (PDF, DOCX, EPUB, TXT, HTML ou JSON), o autor escolhe o arquivo no diálogo Autoria. O navegador calcula o SHA-256 do arquivo (ele não é enviado) e o autor assina, com a chave Ed25519, o texto:

`{"at":…,"content":<hash da versão>,"file":<SHA-256 do arquivo>,"format":…,"protocol":"xuri-1-export","seq":…,"work":…}` (chaves em ordem alfabética).

A prova fica ligada à **última versão registrada**; se o livro mudou desde então, o servidor recusa (409) até haver uma nova versão. Rotas: `POST /api/xuri/export/prepare` e `/export/register` (exigem autenticador aberto e chave de assinatura). O dossiê do autor e a consulta pública (`/api/public/xuri/lookup?q=<SHA-256 do arquivo>`, só obras publicadas) passam a trazer `exports[]`, com `payload` e assinatura para conferência fora do Shakstory.

Limites: a prova mostra que aquele arquivo exato foi ligado, pela chave do autor, a uma versão registrada naquela data. Qualquer alteração no arquivo muda o SHA-256. Ainda não há passaporte embutido dentro do EPUB/DOCX/PDF.

## Consulta por ISBN e UID com prefixo (2026-10-24.3)

A consulta pública (`/api/public/xuri/lookup?q=`) aceita: UID da obra ou da versão (com ou sem o prefixo `xuri:work:` / `xuri:version:`), SHA-256 da versão ou do arquivo exportado, e **ISBN-10 ou ISBN-13** (com ou sem hífens, conferido pelo dígito verificador).

O ISBN é **declarado pelo autor** no livro (campo principal e por formato) e é copiado no momento da publicação; republicar atualiza a lista. Ele serve para localizar a obra, não prova autoria nem edição real. Se mais de uma obra publicada declara o mesmo ISBN, a rota responde 409 `ambiguous_isbn` e pede o UID ou o SHA-256. A resposta traz `match.kind` = `work`, `version`, `hash`, `file` ou `isbn`, para a interface não confundir os tipos de prova.

## Pesquisa por nome, perfil do autor e capa (2026-10-24.4)

- `GET /api/public/xuri/search?q=` (3 a 80 caracteres): obras **publicadas** cujo título ou nome público do autor contém o texto. Até 10 resultados com `id`, `title`, `author`, `publishedAt`, `isbns` e `cover`.
- `GET /api/public/xuri/author?id=a_…`: perfil público (nome, mini biografia) e as obras publicadas desse autor.
- `author.uid` é um identificador público derivado da conta com segredo do servidor (não é o e-mail e não permite descobri-lo). Quem publica escolhe nome e mini biografia (até 600 caracteres) no diálogo Autoria.
- A consulta por UID/hash/ISBN passa a trazer `author { uid, displayName, bio }` e `work.cover`.
- A capa só é publicada se for um endereço `https` curto; imagem embutida não é. Despublicar remove obra, perfil e capa da consulta.
- Os três endpoints dividem o mesmo limite (30 consultas por minuto por endereço). O perfil não identifica a pessoa civil.
