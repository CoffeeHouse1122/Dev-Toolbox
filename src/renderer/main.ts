import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";
import "remixicon/fonts/remixicon.css";
import "./styles/github-theme.css";

createApp(App).use(createPinia()).use(router).mount("#app");
