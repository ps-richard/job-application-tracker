# Learning Log


## 2026-08-26


### HTTP request/response

Estudo da dinâmica de requisição HTTP por parte do código rodando (app.js). Por exemplo: Para adicionar processos, o código faz a requisição via função save(), que envia um fetch com POST para /API/dados, onde o servidor lê isso e recebe um body JSON que é empilhado, parseado (para virar objeto manipulável pelo JavaScript) e que depois é salvo num arquivo hoje funcionando como base de dados (que é um arquivo JSON). O servidor então devolve a chamada da função cb ('callback') para indicar para o app.js que foi salvo corretamente ou se houve algum erro. 

