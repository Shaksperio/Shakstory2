# Auditoria preliminar de integração do KicomAV

## Escopo

Esta nota preserva a pesquisa inicial e registra a implementação Node atual. O gateway, worker Python, sessões e auditoria já existem. A validação controlada usa somente fixtures; nenhum manuscrito real é enviado ao scanner. O runtime Cloudflare publicado não executa o worker Python.

## Constatações verificáveis

| Aspecto | Constatação | Impacto para o Shakstory |
|---|---|---|
| Projeto | KicomAV v0.41, repositório `hanul93/kicomav`, revisão auditada `bad9493` | Fixar uma revisão imutável antes de adotar; não acompanhar automaticamente a branch principal |
| Licença | MIT | Compatível em princípio, condicionada à preservação dos avisos de licença e revisão jurídica do pacote distribuído |
| Runtime | Python 3.10 ou superior | Não deve ser embutido no processo Node/Express do editor |
| Dependências | `yara-python`, `py7zr`, `rarfile`, `pycabfile`, `requests`, `python-dotenv` e `rich`; daemon acrescenta FastAPI, Uvicorn e multipart | Aumenta a superfície de dependências nativas e precisa de SBOM, pinning e análise de vulnerabilidades |
| Interfaces | Scanner local, daemon HTTP e daemon de socket | Preferir worker isolado e comunicação privada; nunca expor o daemon diretamente ao navegador ou à internet |
| Limites | Configuração inclui tamanho máximo, workers, timeout e autenticação opcional por API key | A integração deve impor limites próprios no upload e no gateway, independentemente da configuração do scanner |
| Formatos | Inclui inspeção de arquivos compactados e múltiplos formatos | Exige proteção contra arquivos compactados abusivos, recursão excessiva, expansão de tamanho e links/path traversal |
| Manutenção | O repositório possui releases e atualização de assinaturas, mas é classificado como beta no `pyproject.toml` | A proteção deve ser defesa em profundidade, com estados de falha explícitos e plano para trocar o engine |

## Arquitetura recomendada

O upload deve entrar por um gateway server-side do Shakstory, ser validado por tamanho, MIME declarado, extensão e conteúdo, e somente então ser encaminhado a um worker KicomAV isolado. O worker deve operar em diretório temporário sem acesso às credenciais do banco, ao repositório editorial ou ao restante do filesystem. A comunicação deve usar Unix socket ou rede privada com autenticação server-side; a API key jamais deve ser enviada ao cliente.

O arquivo só deve ser promovido ao armazenamento permanente depois de um resultado `clean`. Resultados `infected`, `error`, `timeout` e `pending` devem permanecer separados do conteúdo editorial. A quarentena deve guardar o mínimo necessário de metadados, com retenção curta e acesso restrito, sem inserir bytes potencialmente maliciosos em colunas do banco. O autosave textual e a recuperação local devem continuar funcionando independentemente da disponibilidade do scanner, mas arquivos não verificados devem falhar de forma segura antes de serem servidos ou compartilhados.

> O KicomAV oferece daemon HTTP e socket, mas a configuração documentada permite autenticação desativada por padrão. No Shakstory, essa configuração nunca deve ser aceita em uma exposição de produção.

## Estado de implementação e validação — 07/10/2026

- Engine vendorizado v0.41/revisão `bad9493`, dependências fixadas em `requirements-kicomav.txt`.
- Gateway por stdin/stdout com 8 MiB, timeout de 20 s e saída limitada. Timeout mantém seu estado próprio; reiniciar a próxima varredura é coberto por teste.
- O subprocesso recebe apenas variáveis de runtime autorizadas; tokens GitHub/JWT não são herdados.
- ZIP inspecionado em memória, sem extração de caminhos: até 128 entradas, 8 MiB expandidos totais, razão máxima 200:1, até três níveis. ZIP criptografado, inválido ou acima dos limites falha fechado.
- Teste real local: conteúdo limpo aprovado, EICAR simples e em ZIP detectados; erro para ZIP inválido, expansão/entradas excessivas, vazio e tamanho excessivo. A revisão carregou 26 assinaturas; não representa atualização do catálogo de ameaças.
- CI adiciona execução do mesmo teste no container sem rede, com filesystem somente leitura, temporários limitados e limite de memória/CPU. O resultado do job deve ser conferido antes de declarar o container validado.

Continuam fora desta validação: atualização e abrangência de assinaturas, formatos compactados além de ZIP, benchmark de carga, banco/storage autenticados reais e ativação do scanner no Worker Cloudflare. O teste não comprova imunidade a arquivos maliciosos desconhecidos.

## Referências

[1]: https://github.com/hanul93/kicomav "KicomAV — repositório oficial auditado"
[2]: https://github.com/hanul93/kicomav/blob/master/LICENSE "KicomAV — licença MIT"
[3]: https://github.com/hanul93/kicomav/blob/master/pyproject.toml "KicomAV — dependências e metadados do pacote"
[4]: https://github.com/hanul93/kicomav/blob/master/README.md "KicomAV — documentação de uso e daemon"


## Confirmação da interface do daemon

A documentação do `k2d.py` confirma que o KicomAV oferece REST API e protocolo de socket, com execução HTTP-only, socket-only ou ambos. A configuração exposta inclui host/porta HTTP, porta/socket Unix, tamanho máximo de upload, número de workers, timeout e API key. A configuração padrão permite autenticação desativada (`require_auth = false`), o que é aceitável apenas para um processo local isolado e não para exposição pública. O Shakstory deverá forçar autenticação e transporte privado no adaptador, além de impor seus próprios limites e timeout.

A revisão também confirmou endpoints de health/info, varredura por arquivo, caminho e stream, e recarga de assinaturas. Como `/scan/path` recebe caminhos, essa operação não deve ser exposta pelo gateway do Shakstory; o fluxo de usuário deve enviar bytes para um diretório temporário criado pelo próprio servidor e destruir o material após a decisão.
