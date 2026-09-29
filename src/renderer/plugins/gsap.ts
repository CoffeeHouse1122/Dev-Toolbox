import type { App, ObjectDirective } from "vue";
import { gsap } from "gsap";
type TweenVars = gsap.TweenVars;
import GsapTransition from "../components/GsapTransition.vue";

type EnterOptions = {
  from?: TweenVars;
  to?: TweenVars;
  duration?: number;
  delay?: number;
  ease?: string;
};

const enterDirective: ObjectDirective<HTMLElement, EnterOptions | undefined> = {
  mounted(element, binding) {
    const options = binding.value ?? {};
    const to = options.to ?? { opacity: 1, x: 0, y: 0 };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(element, to);
      return;
    }
    gsap.fromTo(
      element,
      options.from ?? { opacity: 0, y: 8 },
      {
        ...to,
        duration: options.duration ?? 0.18,
        delay: options.delay ?? 0,
        ease: options.ease ?? "power2.out",
        clearProps: "transform,opacity,willChange"
      }
    );
  },
  beforeUnmount(element) {
    gsap.killTweensOf(element);
  }
};

const liftHandlers = new WeakMap<HTMLElement, Record<string, EventListener>>();
const liftDirective: ObjectDirective<HTMLElement> = {
  mounted(element) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const hoverIn = () => gsap.to(element, { y: -4, rotateZ: -0.35, boxShadow: "0 12px 28px rgba(1, 4, 9, 0.12)", duration: 0.22, ease: "power2.out", overwrite: true });
    const hoverOut = () => gsap.to(element, { y: 0, rotateZ: 0, boxShadow: "none", duration: 0.2, ease: "power2.out", overwrite: true, clearProps: "transform,boxShadow" });
    const press = () => gsap.to(element, { y: -1, scale: 0.992, rotateZ: 0, duration: 0.1, overwrite: true });
    const release = () => gsap.to(element, { scale: 1, duration: 0.16, ease: "power2.out", overwrite: true });
    const handlers: Record<string, EventListener> = { pointerenter: hoverIn, pointerleave: hoverOut, pointerdown: press, pointerup: release, pointercancel: release };
    Object.entries(handlers).forEach(([event, handler]) => element.addEventListener(event, handler));
    liftHandlers.set(element, handlers);
  },
  beforeUnmount(element) {
    const handlers = liftHandlers.get(element);
    if (handlers) Object.entries(handlers).forEach(([event, handler]) => element.removeEventListener(event, handler));
    liftHandlers.delete(element);
    gsap.killTweensOf(element);
  }
};

export function installGsap(app: App) {
  app.component("GsapTransition", GsapTransition);
  app.directive("gsap-enter", enterDirective);
  app.directive("gsap-lift", liftDirective);
}
