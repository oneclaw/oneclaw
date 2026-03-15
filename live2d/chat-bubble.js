/**
 * 对话气泡 UI 组件
 */

class ChatBubble {
  constructor() {
    this.container = document.getElementById("chat-bubble");
    this.content = document.getElementById("chat-bubble-content");
    this.fadeTimer = null;
    this.maxMessages = 4;
  }

  show() {
    this.container.classList.remove("hidden");
    this.resetFadeTimer();
  }

  hide() {
    this.container.classList.add("hidden");
  }

  showUserText(text, opts = {}) {
    if (opts.interim) {
      // 更新或创建临时气泡
      let el = this.content.querySelector(".bubble-interim");
      if (!el) {
        el = this.createBubble(text, "user interim bubble-interim");
      } else {
        el.textContent = text;
      }
    } else {
      // 最终结果：移除临时，添加正式
      const interim = this.content.querySelector(".bubble-interim");
      if (interim) interim.remove();
      this.addMessage(text, "user");
    }
    this.show();
  }

  showAIText(text) {
    this.addMessage(text, "ai");
    this.show();
  }

  showStatus(text) {
    // 更新或创建状态气泡
    let el = this.content.querySelector(".bubble-status");
    if (!el) {
      el = this.createBubble(text, "status bubble-status");
    } else {
      el.textContent = text;
    }
    this.show();
  }

  clearStatus() {
    const el = this.content.querySelector(".bubble-status");
    if (el) el.remove();
  }

  addMessage(text, role) {
    // 移除临时状态
    this.clearStatus();
    const interim = this.content.querySelector(".bubble-interim");
    if (interim) interim.remove();

    this.createBubble(text, role);
    this.trimMessages();
    this.resetFadeTimer();
  }

  createBubble(text, className) {
    const el = document.createElement("div");
    el.className = "bubble-message " + className;
    el.textContent = text;
    this.content.appendChild(el);
    // 滚动到底部
    this.container.scrollTop = this.container.scrollHeight;
    return el;
  }

  trimMessages() {
    const messages = this.content.querySelectorAll(".bubble-message:not(.bubble-status):not(.bubble-interim)");
    while (messages.length > this.maxMessages) {
      messages[0].remove();
    }
  }

  resetFadeTimer() {
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    this.fadeTimer = setTimeout(() => {
      this.hide();
    }, 15000); // 15秒后自动隐藏
  }

  clear() {
    this.content.innerHTML = "";
    this.hide();
  }
}

window.chatBubble = new ChatBubble();
