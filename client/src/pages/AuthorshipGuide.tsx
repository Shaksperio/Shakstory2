import { Link } from "wouter";
import { ArrowLeft, CheckCircle2, KeyRound, ShieldCheck, FileCheck2, AlertTriangle } from "lucide-react";

export default function AuthorshipGuide({ onBack }: { onBack?: () => void }) {
  return <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
    {onBack ? <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm text-primary underline"><ArrowLeft className="h-4 w-4" /> Voltar ao Shakstory</button> : <Link href="/" className="inline-flex items-center gap-2 text-sm text-primary underline"><ArrowLeft className="h-4 w-4" /> Voltar ao Shakstory</Link>}
    <header className="mt-6">
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">Shakstory · X-URI</p>
      <h1 className="mt-2 font-serif text-3xl sm:text-4xl">Autoria e procedência, passo a passo</h1>
      <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">Este guia mostra como registrar versões do seu livro, guardar o dossiê e verificar as evidências sem precisar entender criptografia.</p>
    </header>
    <section className="mt-7 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Antes de começar</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6"><li>Entre no endereço principal do Shakstory e abra o livro que deseja documentar.</li><li>Guarde cópias do manuscrito e dos dossiês em local seguro.</li><li>Se criar uma chave de assinatura, guarde a frase-senha e o arquivo de backup. Sem eles, a chave privada não pode ser recuperada.</li></ul>
    </section>
    <ol className="mt-6 space-y-4">
      <li className="rounded-2xl border border-border bg-card p-5"><h2 className="text-lg font-semibold">1. Ative a autenticação em duas etapas</h2><p className="mt-2 text-sm leading-6">No menu lateral, abra <strong>Segurança</strong> e siga as instruções para configurar um aplicativo autenticador (TOTP), como o Google Authenticator. Guarde os códigos de recuperação. Essa etapa protege o registro, mas não é, por si só, uma assinatura digital.</p></li>
      <li className="rounded-2xl border border-border bg-card p-5"><h2 className="text-lg font-semibold">2. Configure a chave de assinatura</h2><p className="mt-2 text-sm leading-6">Em <strong>Minha conta</strong>, abra o cartão <strong>Autoria</strong> do livro e procure a opção para criar a chave Ed25519. Crie uma frase-senha forte, guarde-a e faça o backup oferecido. A chave privada fica cifrada no aparelho; o servidor guarda a chave pública. Se não configurar uma chave, alguns registros poderão ficar sem assinatura.</p></li>
      <li className="rounded-2xl border border-border bg-card p-5"><h2 className="text-lg font-semibold">3. Registre uma versão</h2><p className="mt-2 text-sm leading-6">No cartão Autoria do livro, solicite o registro e informe o código temporário do autenticador quando pedido. Se a chave estiver configurada, siga a confirmação de assinatura no navegador. Repita em marcos importantes do manuscrito. O registro não impede futuras edições.</p></li>
      <li className="rounded-2xl border border-border bg-card p-5"><h2 className="text-lg font-semibold">4. Baixe o dossiê JSON</h2><p className="mt-2 text-sm leading-6">No cartão Autoria, use <strong>Dossiê</strong> para baixar o arquivo. Preserve o arquivo original e a cópia exata do manuscrito correspondente. O dossiê inclui o e-mail associado à conta; confira os dados pessoais antes de compartilhá-lo.</p></li>
      <li className="rounded-2xl border border-border bg-card p-5"><h2 className="text-lg font-semibold">5. Verifique o arquivo</h2><p className="mt-2 text-sm leading-6">Abra o verificador público abaixo, selecione o arquivo JSON e aguarde o resultado. O arquivo é processado localmente no navegador e não é enviado automaticamente ao servidor.</p><a href={import.meta.env.BASE_URL + "verificar/xuri"} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"><FileCheck2 className="h-4 w-4" /> Abrir verificador X-URI</a></li>
    </ol>
    <section className="mt-7 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Como entender o resultado</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-4"><h3 className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5 text-primary" /> Integridade conferida</h3><p className="mt-2 text-sm leading-6">Os hashes e vínculos entre registros conferem com os dados do dossiê. Isso ajuda a detectar alterações no arquivo.</p></div>
        <div className="rounded-xl border border-border p-4"><h3 className="flex items-center gap-2 font-semibold"><KeyRound className="h-5 w-5 text-primary" /> Assinatura válida</h3><p className="mt-2 text-sm leading-6">A assinatura corresponde à chave pública incluída. Isso demonstra o uso da chave privada correspondente, mas não identifica automaticamente uma pessoa.</p></div>
        <div className="rounded-xl border border-border p-4"><h3 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-primary" /> Sem assinatura ou parcial</h3><p className="mt-2 text-sm leading-6">Uma ou mais versões não foram assinadas. Leia o resultado de cada versão antes de tirar conclusões.</p></div>
        <div className="rounded-xl border border-border p-4"><h3 className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-5 w-5 text-primary" /> Falha ou não verificável</h3><p className="mt-2 text-sm leading-6">Não ignore o aviso. Preserve o arquivo original e peça ajuda antes de usar o dossiê como evidência.</p></div>
      </div>
    </section>
    <section className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
      <h2 className="text-lg font-semibold">Limites importantes</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6"><li>O X-URI oferece evidências técnicas de integridade e procedência; não é certidão de autoria nem prova de identidade civil ou de quem escreveu o texto.</li><li>O verificador confere hashes, cadeia e assinaturas Ed25519. Ele <strong>não valida criptograficamente</strong> o carimbo RFC 3161; essa conferência exige OpenSSL e um certificado confiável.</li><li>O dossiê não contém o livro completo. Guarde o manuscrito original para comparação.</li><li>Uma chave marcada como revogada pode ainda ter assinatura histórica matematicamente válida; o estado da chave é mostrado separadamente.</li></ul>
    </section>
    <p className="mt-6 text-xs leading-5 text-muted-foreground">Dica: registre versões em marcos importantes e guarde cada dossiê junto da cópia exata do manuscrito correspondente.</p>
  </main>;
}
