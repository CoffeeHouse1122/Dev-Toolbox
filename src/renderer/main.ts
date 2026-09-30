import { createApp } from "vue";
import { createPinia } from "pinia";
import SimpleBar from "simplebar";
import App from "./App.vue";
import { installGsap } from "./plugins/gsap";
import { router } from "./router";
import { reportWorkspaceError } from "./composables/useWorkspaceToast";
import "remixicon/fonts/remixicon.css";
import "simplebar/dist/simplebar.css";
import "./styles/github-theme.css";

const simpleBarSelector = ".dt-simplebar";
const simpleBarInstances = new WeakMap<HTMLElement, SimpleBar>();
let simpleBarRecalcFrame = 0;

function initSimpleBarElement(element: HTMLElement) {
	if (simpleBarInstances.has(element)) {
		simpleBarInstances.get(element)?.recalculate();
		return;
	}
	element.setAttribute("data-simplebar", "init");
	element.classList.add("dt-simplebar-host");
	const instance = new SimpleBar(element, {
		autoHide: false,
		scrollbarMinSize: 28
	});
	simpleBarInstances.set(element, instance);
	requestAnimationFrame(() => instance.recalculate());
}

function initSimpleBars(root: ParentNode = document) {
	const elements = new Set<HTMLElement>();
	if (root instanceof HTMLElement && root.matches(simpleBarSelector)) {
		elements.add(root);
	}
	if ("querySelectorAll" in root) {
		root.querySelectorAll<HTMLElement>(simpleBarSelector).forEach((element) => elements.add(element));
	}
	for (const element of elements) {
		initSimpleBarElement(element);
	}
}

function recalculateSimpleBars(root: ParentNode = document) {
	const elements = new Set<HTMLElement>();
	if (root instanceof HTMLElement && root.matches(simpleBarSelector)) {
		elements.add(root);
	}
	if ("querySelectorAll" in root) {
		root.querySelectorAll<HTMLElement>(simpleBarSelector).forEach((element) => elements.add(element));
	}
	for (const element of elements) {
		simpleBarInstances.get(element)?.recalculate();
	}
}

function scheduleSimpleBarRecalculation(root: ParentNode = document) {
	if (simpleBarRecalcFrame) {
		return;
	}
	simpleBarRecalcFrame = requestAnimationFrame(() => {
		simpleBarRecalcFrame = 0;
		initSimpleBars(root);
		recalculateSimpleBars();
	});
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

window.addEventListener("focusin", (event) => disableSpellcheck(event.target));

const app = createApp(App);
app.config.errorHandler = (error, _instance, info) => {
	reportWorkspaceError(error);
	console.error(`Renderer operation failed (${info})`);
};
window.addEventListener("unhandledrejection", event => reportWorkspaceError(event.reason));
app.use(createPinia()).use(router).use(installGsap).mount("#app");
disableSpellcheckIn();
initSimpleBars();
scheduleSimpleBarRecalculation();
router.afterEach(() => scheduleSimpleBarRecalculation());
window.addEventListener("resize", () => scheduleSimpleBarRecalculation());

if (document.documentElement.dataset.reloadBoot === "1") {
	requestAnimationFrame(() => {
		document.documentElement.dataset.reloadBoot = "closing";
		window.setTimeout(() => {
			document.documentElement.removeAttribute("data-reload-boot");
		}, 280);
	});
}

new MutationObserver((mutations) => {
	let shouldRecalculateSimpleBars = false;
	for (const mutation of mutations) {
		mutation.addedNodes.forEach((node) => {
			if (node instanceof HTMLElement) {
				disableSpellcheckIn(node);
				initSimpleBars(node);
				shouldRecalculateSimpleBars = true;
			}
		});
	}
	if (shouldRecalculateSimpleBars) {
		scheduleSimpleBarRecalculation();
	}
}).observe(document.body, { childList: true, subtree: true });
