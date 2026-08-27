# Arquitetura das versões

Arquivo principal citando as estruturas da aplicação conforme temos as versões

## V0

Aqui o que acontece é que temos um servidor rodando localmente através de Node.js. O servidor server.js fica rodando e disponível na porta 8934. 

Quando entramos no http://localhost:8934, o browser faz uma requisição para o servidor, que devolve com o index.html (HTML/CSS)  e o código app.js que é onde a página vai rodar. Com isso ele renderiza a página.

O app.js é o código da aplicação que vai preencher com base nos dados persistentes que estão no servidor num arquivo json (data.json) e é o responsável por reger as interações com o usuário.

Ao criar um novo processo seletivo, por exemplo, ele que abre o modal quando o usuário clica no botão e ele que armazena essas informações e envia via fetch numa requisição HTTP post que o servidor recebe e entende que deve armazenar as informações em JSON recebidas, transforma-as a partir de um parser para um objeto manipulável por JavaScript e então preenche no arquivo persistente essa informação juntando ela novamente a partir de um JSON.stringify que junta os dados ao arquivo persistente. 

DOM = representação sendo mostrada no navegador // state = dados na memória da aplicação 

Importante: porque precisa ser feita mudança na stack da estrutura que estamos para uma base de dados em PostgreSQL, por exemplo? Para podermos trabalhar com usuários autenticados. Hoje é impossível escalar desse jeito pois não existe autenticação nem tratamento dos dados então todos usuários veriam a base completa.

----------


