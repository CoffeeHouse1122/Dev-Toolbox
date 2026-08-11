<script setup lang="ts">
import { gsap, type TweenVars } from "gsap";
import { onBeforeUnmount } from "vue";

const props = withDefaults(defineProps<{
  appear?: boolean;
  mode?: "in-out" | "out-in" | "default";
  from?: TweenVars;
  to?: TweenVars;
  leave?: TweenVars;
  duration?: number;
  ease?: string;
  childSelector?: string;
  childFrom?: TweenVars;
  childTo?: TweenVars;
  childLeave?: TweenVars;
}>(), {
  appear: false,
  mode: "default",
  from: () => ({ opacity: 0, y: 8 }),
  to: () => ({ opacity: 1, y: 0 }),
  leave: () => ({ opacity: 0, y: -6 }),
  duration: 0.18,
  ease: "power2.out",
  childSelector: "",
  childFrom: () => ({}),
  childTo: () => ({}),
  childLeave: () => ({})
});

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

type TransitionRecord = {
  timeline: gsap.core.Timeline | null;
  targets: Element[];
};

const activeTransitions = new Map<Element, TransitionRecord>();

function childOf(element: Element) {
  return props.childSelector ? element.querySelector(props.childSelector) : null;
}

function targetsOf(element: Element) {
  const child = childOf(element);
  return child ? [element, child] : [element];
}

function killTransition(element: Element) {
  const record = activeTransitions.get(element);
  activeTransitions.delete(element);
  record?.timeline?.kill();
  for (const target of record?.targets ?? targetsOf(element)) {
    gsap.killTweensOf(target);
  }
}

function releaseTimeline(element: Element, timeline: gsap.core.Timeline) {
  if (activeTransitions.get(element)?.timeline === timeline) {
    activeTransitions.delete(element);
  }
}

function createTimeline(element: Element, done: () => void) {
  const targets = targetsOf(element);
  let timeline: gsap.core.Timeline;
  timeline = gsap.timeline({
    onComplete: () => {
      releaseTimeline(element, timeline);
      done();
    },
    onInterrupt: () => releaseTimeline(element, timeline)
  });
  activeTransitions.set(element, { timeline, targets });
  return { timeline, targets };
}

function beforeEnter(element: Element) {
  killTransition(element);
  const targets = targetsOf(element);
  activeTransitions.set(element, { timeline: null, targets });
  const child = targets[1];
  if (reducedMotion.matches) {
    gsap.set(element, props.to);
    if (child) gsap.set(child, props.childTo);
    return;
  }
  gsap.set(element, props.from);
  if (child) gsap.set(child, props.childFrom);
}

function enter(element: Element, done: () => void) {
  killTransition(element);
  if (reducedMotion.matches) {
    done();
    return;
  }
  const { timeline, targets } = createTimeline(element, done);
  timeline.to(element, { ...props.to, duration: props.duration, ease: props.ease }, 0);
  const child = targets[1];
  if (child) timeline.to(child, { ...props.childTo, duration: props.duration, ease: props.ease }, 0);
}

function leave(element: Element, done: () => void) {
  killTransition(element);
  if (reducedMotion.matches) {
    done();
    return;
  }
  const { timeline, targets } = createTimeline(element, done);
  timeline.to(element, { ...props.leave, duration: props.duration * 0.82, ease: "power1.in" }, 0);
  const child = targets[1];
  if (child) timeline.to(child, { ...props.childLeave, duration: props.duration * 0.82, ease: "power1.in" }, 0);
}

function cancel(element: Element) {
  killTransition(element);
}

onBeforeUnmount(() => {
  for (const [element] of activeTransitions) {
    killTransition(element);
  }
});
</script>

<template>
  <Transition
    :appear="appear"
    :mode="mode === 'default' ? undefined : mode"
    :css="false"
    @before-enter="beforeEnter"
    @enter="enter"
    @leave="leave"
    @enter-cancelled="cancel"
    @leave-cancelled="cancel"
  >
    <slot></slot>
  </Transition>
</template>
