import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";
import "remixicon/fonts/remixicon.css";
import "./styles/github-theme.css";

function isEditableTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) return false;
	return Boolean(target.closest("input, textarea, [contenteditable='true']"));
}

function disableSpellcheck(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) return;
	const field = target.closest("input, textarea, [contenteditable='true']");
	if (field instanceof HTMLElement) {
		field.setAttribute("spellcheck", "false");
	}
}

function disableSpellcheckIn(root: ParentNode = document) {
	root.querySelectorAll("input, textarea, [contenteditable='true']").forEach((field) => {
		if (field instanceof HTMLElement) field.setAttribute("spellcheck", "false");
	});
}

window.addEventListener("keydown", (event) => {
	if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && !isEditableTarget(event.target)) {
		event.preventDefault();
	}
});

window.addEventListener("focusin", (event) => disableSpellcheck(event.target));

createApp(App).use(createPinia()).use(router).mount("#app");
disableSpellcheckIn();

new MutationObserver((mutations) => {
	for (const mutation of mutations) {
		mutation.addedNodes.forEach((node) => {
			if (node instanceof HTMLElement) disableSpellcheckIn(node);
		});
	}
}).observe(document.body, { childList: true, subtree: true });
