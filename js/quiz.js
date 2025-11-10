// =====================
// Comunicação nativa
// =====================
function sendToNative(payload) {
  try {
    if (window.webkit?.messageHandlers?.quiz?.postMessage) {
      window.webkit.messageHandlers.quiz.postMessage(payload);
    } else {
      console.log("[Debug/Web]", payload);
    }
  } catch (e) {
    console.error("Erro ao enviar ao nativo:", e);
  }
}

// =====================
// Dados do Quiz
// =====================
let QUIZ = {
  title: "Quiz de Exemplo",
  questions: [
    {
      id: "q1",
      text: "Qual é a capital da França?",
      options: [
        { id: "a", text: "Paris", correct: true },
        { id: "b", text: "Lyon" },
        { id: "c", text: "Marselha" }
      ]
    },
    {
      id: "q2",
      text: "Quanto é 2 + 2?",
      options: [
        { id: "a", text: "3" },
        { id: "b", text: "4", correct: true },
        { id: "c", text: "5" }
      ]
    },
    {
      id: "q3",
      text: "Qual é a cor do céu em um dia claro?",
      options: [
        { id: "a", text: "Azul", correct: true },
        { id: "b", text: "Verde" },
        { id: "c", text: "Amarelo" }
      ]
    }
  ]
};

const answers = new Map();
let quizCompletedSent = false; // ✅ controle de múltiplas chamadas

// =====================
// Roteamento
// =====================
function getCurrentQuestionIndex() {
  const path = window.location.pathname;
  const match = path.match(/pergunta-(\d+)/);
  if (match) {
    const idx = parseInt(match[1], 10) - 1;
    return Number.isNaN(idx) ? 0 : idx;
  }
  return 0;
}

function navigateToNext() {
  const currentIndex = getCurrentQuestionIndex();
  const nextIndex = currentIndex + 1;
  const total = QUIZ.questions.length;

  if (nextIndex >= total) {
    const route = "/resultado";
    sendToNative({ type: "navigate", route });

    // fallback web
    if (!window.webkit?.messageHandlers?.quiz) {
      window.history.pushState({}, "", route);
      renderResult();
    }
    return;
  }

  const route = `/pergunta-${nextIndex + 1}`;
  sendToNative({ type: "navigate", route });

  if (!window.webkit?.messageHandlers?.quiz) {
    window.history.pushState({}, "", route);
    renderQuiz();
  }
}

// =====================
// Renderização
// =====================
function renderQuiz() {
  quizCompletedSent = false; // reset flag ao voltar às perguntas

  const root = document.getElementById("quiz");
  const resultEl = document.getElementById("result");
  const nextBtn = document.getElementById("nextBtn");

  // ✅ mostra o botão de "Próximo" nas perguntas
  if (nextBtn) nextBtn.classList.remove("hidden");

  resultEl.classList.add("hidden");
  root.innerHTML = "";

  const index = getCurrentQuestionIndex();
  const q = QUIZ.questions[index];
  if (!q) return renderResult();

  const qEl = document.createElement("article");
  qEl.className = "question";
  qEl.innerHTML = `
    <div class="q-title">${index + 1}. ${q.text}</div>
    ${q.options
      .map(
        (opt) => `
      <div class="option ${
        answers.get(q.id) === opt.id ? "selected" : ""
      }" data-q="${q.id}" data-opt="${opt.id}">
        ${opt.text}
      </div>
    `
      )
      .join("")}
  `;
  root.appendChild(qEl);

  document.querySelectorAll(".option").forEach((el) => {
    el.addEventListener("click", () => {
      const qid = el.dataset.q;
      const oid = el.dataset.opt;
      answers.set(qid, oid);

      document
        .querySelectorAll(`.option[data-q="${qid}"]`)
        .forEach((o) => {
          o.classList.toggle("selected", o.dataset.opt === oid);
        });

      sendToNative({
        type: "answerSelected",
        questionId: qid,
        optionId: oid,
        route: window.location.pathname,
      });
    });
  });
}

function renderResult() {
  const root = document.getElementById("quiz");
  const resultEl = document.getElementById("result");
  const nextBtn = document.getElementById("nextBtn");

  root.innerHTML = "";

  const { score, total } = gradeQuiz();
  resultEl.textContent = `Você acertou ${score} de ${total}.`;
  resultEl.classList.remove("hidden");

  // ✅ esconde o botão "Próximo" na tela de resultado
  if (nextBtn) nextBtn.classList.add("hidden");

  console.log("[Resultado Calculado]", {
    score,
    total,
    respostas: Array.from(answers.entries()),
  });

  if (!quizCompletedSent) {
    quizCompletedSent = true;
    sendToNative({ type: "quizCompleted", score, total });
  }
}

function gradeQuiz() {
  let correct = 0;
  const details = QUIZ.questions.map((q) => {
    const chosen = answers.get(q.id);
    const chosenObj = q.options.find((o) => o.id === chosen);
    const correctObj = q.options.find((o) => o.correct);
    const isCorrect = chosenObj?.correct || false;
    if (isCorrect) correct++;
    return { questionId: q.id, chosen, correct: correctObj?.id, isCorrect };
  });
  return { score: correct, total: QUIZ.questions.length, details };
}

// =====================
// Eventos
// =====================
document.getElementById("nextBtn").addEventListener("click", navigateToNext);

// =====================
// Mensagens do nativo
// =====================
window.onNativeMessage = function (message) {
  try {
    const msg = typeof message === "string" ? JSON.parse(message) : message;
    switch (msg.type) {
      case "loadQuiz":
        QUIZ = msg.payload;
        answers.clear();
        quizCompletedSent = false;
        renderQuiz();
        break;

      case "loadAnswers":
        answers.clear();
        msg.payload.forEach((a) => {
          if (a.questionId && a.optionId) {
            answers.set(a.questionId, a.optionId);
          }
        });
        console.log("[Restauradas do nativo]", Array.from(answers.entries()));

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", () => {
            if (window.location.pathname.includes("resultado")) renderResult();
            else renderQuiz();
          });
        } else {
          if (window.location.pathname.includes("resultado")) renderResult();
          else renderQuiz();
        }
        break;

      default:
        console.log("[fromNative]", msg);
    }
  } catch (e) {
    console.error("onNativeMessage error:", e);
  }
};

// =====================
// Inicialização
// =====================
window.addEventListener("DOMContentLoaded", () => {
  const path = window.location.pathname;

  if (!path.includes("pergunta-") && !path.includes("resultado")) {
    window.history.replaceState({}, "", "/pergunta-1");
    renderQuiz();
    return;
  }

  if (path.includes("resultado")) {
    renderResult();
  } else {
    renderQuiz();
  }
});