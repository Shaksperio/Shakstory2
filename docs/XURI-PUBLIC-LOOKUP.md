# Consulta pública do Passaporte X-URI

## Objetivo

Permitir que qualquer pessoa consulte um passaporte por UID da obra, UID da versão ou SHA-256, sem login e sem expor dados privados da conta.

## Contrato HTTP proposto

`GET /api/xuri/public/lookup?q=<uid-ou-sha256>`

Respostas:
- `200`: registro público encontrado, com manifesto público e estado das verificações.
- `400`: consulta vazia ou formato inválido.
- `404`: nenhum registro público correspondente.
- `429`: limite de consultas excedido.
- `503`: serviço de consulta pública indisponível.

O retorno público deve usar um esquema de lista de permissões. Nunca retornar e-mail da conta, tokens TOTP/de recuperação, chave privada, dados de sessão ou o manuscrito integral.

## Modelo de resposta (contrato, não registro real)

```json
{
  "protocol": "xuri-1",
  "work": { "id": "book-...", "title": "Título público" },
  "version": {
    "id": "version-...",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "contentHash": "<sha256>",
    "entryHash": "<sha256>",
    "entryPayload": "<payload assinado>"
  },
  "author": { "displayName": "Nome público opcional" },
  "signature": {
    "algorithm": "Ed25519",
    "keyId": "<id>",
    "publicKey": "<chave pública>",
    "status": "present"
  },
  "timestamp": { "status": "not-validated" },
  "verificationUrl": "/verificar/xuri?q=<uid-ou-hash>"
}
```

O exemplo acima é apenas um contrato de API e não deve ser exibido como um registro verificado.

## Regras de verificação e privacidade

1. UID identifica obra/versão; SHA-256 identifica bytes ou conteúdo canônico definido. Não os tratar como equivalentes.
2. O backend deve localizar somente registros explicitamente publicados pelo titular; não tornar todos os dossiês privados pesquisáveis automaticamente.
3. A interface deve recalcular hashes e validar a assinatura Ed25519 no navegador com o payload exato e a chave pública publicada.
4. Mostrar separadamente integridade, assinatura, estado atual da chave e carimbo RFC 3161. Não afirmar validação criptográfica do RFC 3161 até verificar token, TSTInfo e cadeia de certificados confiável.
5. Não expor e-mail, segredo TOTP, códigos de recuperação, chave privada nem conteúdo integral da obra.
6. A página deve permitir abrir/baixar um recibo público mínimo para verificação independente.
7. Adicionar rate limiting, normalização/validação da consulta e cabeçalhos CORS restritos ao domínio público do Shakstory.

## Dependências para concluir a funcionalidade

- Persistência/índice público de registros opt-in no Worker X-URI.
- Endpoint de consulta e política explícita de publicação/revogação.
- UI de pesquisa na página `/verificar/xuri` e renderização do cartão apenas após receber e verificar dados reais.
- Testes para UID inexistente, hash inválido, registro privado, assinatura inválida, chave revogada e falha do serviço.
