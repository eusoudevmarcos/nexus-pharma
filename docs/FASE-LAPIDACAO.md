# Fase de Lapidação

Objetivo: transformar funcionalidades prontas em rotinas seguras, explicáveis e agradáveis para o piloto operacional.

## Entrega 1 — recertificação de acessos

### Implementado

- campanha periódica por empresa, com período, prazo e responsável;
- apenas uma campanha aberta por empresa;
- snapshot imutável de nome, e-mail, perfil e situação de cada vínculo;
- hash SHA-256 do snapshot para comprovação de integridade;
- decisões `CONFIRMED`, `ADJUSTMENT_REQUIRED` e `REVOKED` por usuário;
- justificativa obrigatória para ajuste ou revogação;
- revogação imediata somente após digitar `REVOGAR ACESSO`;
- proteção contra autorrevogação e remoção do último proprietário;
- conclusão somente após revisar todos os itens;
- conclusão por outro proprietário ou administrador, com a frase `CONCLUIR REVISAO`;
- detecção visual de divergência entre o snapshot e o vínculo atual;
- exportação CSV com hash, situação original, situação atual, decisão, justificativa e revisor;
- trilha de auditoria para abertura, decisão, revogação e conclusão;
- painel responsivo dentro da janela de Usuários.

### Dependência de implantação

- executar a migration `20260901033000_access_review_governance` no Render com `prisma migrate deploy`.

## Entrega 2 — MFA e confirmação reforçada

### Implementado

- segundo fator TOTP compatível com aplicativos autenticadores;
- confirmação da senha atual antes de iniciar a configuração;
- segredo TOTP criptografado e dez códigos de recuperação armazenados somente como hash;
- desafio de segundo fator antes de criar a sessão no login;
- rotação e consumo único de códigos, inclusive proteção contra repetição do mesmo TOTP;
- confirmação reforçada (`step-up`) válida por dez minutos e limitada à sessão atual;
- desativação com senha, código atual, confirmação textual e revogação das outras sessões;
- MFA obrigatório para proprietários, administradores de empresa e toda a equipe interna;
- proteção reforçada nas ações de usuários, recertificação, homologação fiscal e revogação de sessões;
- cobertura de MFA e falhas do segundo fator na Central de Segurança;
- bloqueio no Go-live enquanto houver perfil privilegiado sem MFA;
- trilha de auditoria para ativação, falha, sucesso, confirmação reforçada e desativação.

### Dependências de implantação

- executar a migration `20260901040000_mfa_and_step_up` no Render com `prisma migrate deploy`;
- manter `MFA_ENCRYPTION_KEY` exclusiva, com ao menos 32 caracteres, somente na API do Render;
- cada usuário privilegiado deve acessar **Minha segurança** e concluir a ativação antes do piloto.

## Próximos blocos da lapidação

1. políticas de perfil personalizadas, derivadas dos perfis padrão e sem elevação implícita;
2. sessão de suporte temporária, consentida, motivada e auditada;
3. refinamento de estados vazios, carregamento, erros e confirmações em todas as telas produtivas;
4. acessibilidade, atalhos, navegação por teclado e contraste;
5. desempenho percebido, cache seguro e redução de consultas repetidas;
6. homologação guiada por perfil e registro dos casos de aceite.
