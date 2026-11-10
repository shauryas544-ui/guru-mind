import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Brain,
  Compass,
  Fingerprint,
  BookMarked,
  Users,
  GraduationCap,
  Eye,
  Stethoscope,
  Presentation,
  ClipboardCheck,
  TrendingUp,
  ShieldCheck,
  ArrowRight,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Guru Mind — Learning That Understands You" },
      {
        name: "description",
        content:
          "Your personal AI Tutor and Mentor for English. Finds the root of your mistakes, remembers what you learn, and helps you improve every day.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: GraduationCap,
    title: "Personal AI Tutor",
    text: "Learn with explanations designed around your level.",
  },
  {
    icon: Compass,
    title: "Intelligent Mentor",
    text: "Speak naturally with voice and get real-life learning challenges.",
  },
  { icon: Brain, title: "Learner Model", text: "See your strengths, weak spots and progress." },
  {
    icon: Fingerprint,
    title: "Mistake Fingerprint",
    text: "Discover the root causes behind repeated mistakes.",
  },
  {
    icon: BookMarked,
    title: "Learning Memory",
    text: "Important lessons and history, neatly organized.",
  },
  {
    icon: Users,
    title: "Echo Twin",
    text: "Compare your past mistakes with your abilities today.",
  },
];

const steps = [
  { icon: Eye, title: "Observe", text: "Understand the learner." },
  { icon: Stethoscope, title: "Diagnose", text: "Find mistakes and weak areas." },
  { icon: Presentation, title: "Teach", text: "One concept at a time." },
  { icon: ClipboardCheck, title: "Test", text: "Check understanding." },
  { icon: TrendingUp, title: "Improve", text: "Update your progress." },
];

const faqs = [
  {
    q: "Who is Guru Mind for?",
    a: "Anyone learning English or Indian languages — especially learners who think in Hindi and want clear explanations in Hinglish, Hindi, or English.",
  },
  {
    q: "Will the tutor correct every small mistake?",
    a: "No. It focuses on at most two important mistakes per message so you're never overwhelmed.",
  },
  {
    q: "How do voice conversations work?",
    a: "Guru Mind combines Gemini AI reasoning with Gnani AI Indian-accent speech recognition and natural voice playback so you can speak and listen effortlessly.",
  },
  {
    q: "Is my data private?",
    a: "Yes. Your conversations and progress belong strictly to your account via Row Level Security, and you can export or delete them anytime.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link to="/">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">
              Features
            </a>
            <a href="#how" className="hover:text-foreground">
              How it works
            </a>
            <a href="#privacy" className="hover:text-foreground">
              Privacy
            </a>
            <a href="#faq" className="hover:text-foreground">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Log in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth" search={{ mode: "signup" }}>
                Get started
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-glow" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 lg:grid-cols-[1.05fr_1fr] lg:py-28">
          <div className="animate-rise">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-secondary-foreground">
              <span className="size-1.5 rounded-full bg-success" /> Your Learning. Your Mind. Your
              Growth.
            </span>
            <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
              Learning that <span className="text-brand">understands</span> you.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Meet your personal AI Tutor and Voice Mentor. Guru Mind understands your learning
              patterns, finds the root of your mistakes, remembers what you learn, and helps you get
              better every day.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="shadow-lift">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Get started <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#features">Explore features</a>
              </Button>
            </div>
          </div>
          <ProductPreview />
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-5 py-20">
        <SectionHead eyebrow="Features" title="Everything a great teacher does — remembered." />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="surface p-6 transition-transform hover:-translate-y-0.5">
              <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-5 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="border-y border-border bg-card">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <SectionHead eyebrow="How it works" title="Five simple steps, every session." />
          <div className="mt-12 grid gap-4 md:grid-cols-5">
            {steps.map((s, i) => (
              <div
                key={s.title}
                className="relative rounded-xl border border-border bg-background p-5"
              >
                <span className="text-xs font-semibold text-muted-foreground">0{i + 1}</span>
                <s.icon className="mt-3 size-6 text-primary" />
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-2">
        <div>
          <SectionHead
            eyebrow="Why Guru Mind"
            title="Not a chatbot. A teacher who knows you."
            align="left"
          />
          <p className="mt-5 text-muted-foreground">
            Most apps give everyone the same lesson. Guru Mind builds a picture of how <em>you</em>{" "}
            learn — which mistakes repeat, why they happen, and what to practise next.
          </p>
        </div>
        <ul className="space-y-3">
          {[
            "Explanations in simple English, Hindi, or Hinglish",
            "At most two corrections at a time",
            "Voice conversation with Gnani Indian Speech AI",
            "Remembers your repeated mistakes & constant notes",
            "End-of-session reviews & weekly progress reports",
          ].map((t) => (
            <li key={t} className="surface flex items-center gap-3 p-4 text-sm">
              <Check className="size-4 text-success" />
              {t}
            </li>
          ))}
        </ul>
      </section>

      <section id="privacy" className="mx-auto max-w-6xl px-5 pb-20">
        <div className="surface flex flex-col items-start gap-6 bg-glow p-8 md:flex-row md:items-center md:p-10">
          <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-2xl bg-success-soft text-success">
            <ShieldCheck className="size-7" />
          </span>
          <div className="flex-1">
            <h3 className="font-display text-2xl font-semibold">
              You stay in control of your data
            </h3>
            <p className="mt-2 text-muted-foreground">
              Your learning history is private to your account. Export it or delete it whenever you
              want.
            </p>
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-3xl px-5 pb-24">
        <SectionHead eyebrow="FAQ" title="Questions, answered." />
        <Accordion type="single" collapsible className="mt-10">
          {faqs.map((f) => (
            <AccordionItem key={f.q} value={f.q}>
              <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-muted-foreground md:flex-row">
          <Logo />
          <p>© {new Date().getFullYear()} Guru Mind. Your Learning. Your Mind. Your Growth.</p>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({
  eyebrow,
  title,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "text-center" : ""}>
      <p className="text-sm font-semibold text-primary">{eyebrow}</p>
      <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-4xl">
        {title}
      </h2>
    </div>
  );
}

function ProductPreview() {
  return (
    <div className="relative animate-rise [animation-delay:150ms]">
      <div className="surface shadow-lift overflow-hidden">
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
          <span className="size-2.5 rounded-full bg-destructive/60" />
          <span className="size-2.5 rounded-full bg-warning/70" />
          <span className="size-2.5 rounded-full bg-success/70" />
          <span className="ml-3 text-xs text-muted-foreground">AI Tutor · Learn mode</span>
        </div>
        <div className="space-y-4 p-5">
          <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
            I am go to college every day.
          </div>
          <div className="rounded-xl border border-border bg-background p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sahi version
            </p>
            <p className="mt-2 text-destructive line-through">I am go to college.</p>
            <p className="font-medium text-success">I go to college.</p>
            <p className="mt-2 text-muted-foreground">
              Routine batane ke liye Present Simple mein "am" ki zaroorat nahi hoti.
            </p>
            <span className="mt-3 inline-block rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-foreground">
              Root cause: mixing "am" with present simple
            </span>
          </div>
          <p className="text-sm text-foreground">
            Great effort! Now tell me — what do you do after college?
          </p>
        </div>
      </div>
      <div className="surface absolute -bottom-8 -left-6 hidden w-56 p-4 md:block">
        <p className="text-xs text-muted-foreground">Practice accuracy</p>
        <p className="mt-1 text-2xl font-bold">81%</p>
        <div className="mt-2 h-1.5 rounded-full bg-muted">
          <div className="h-full w-4/5 rounded-full bg-brand" />
        </div>
        <p className="mt-2 text-xs text-success">+19% this week</p>
      </div>
    </div>
  );
}
