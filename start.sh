#!/bin/bash
# Sobe o servidor local em background, resistente ao fechamento do terminal
# (nohup + disown), para o botão "Buscar referência salarial" funcionar mesmo
# depois que você fechar esta janela.
cd "$(dirname "$0")"
nohup node server.js > server.log 2>&1 &
disown
echo "Servidor rodando em http://localhost:8934/ (PID $!)"
