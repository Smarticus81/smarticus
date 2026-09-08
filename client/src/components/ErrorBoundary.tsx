import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="recovery-screen">
          <section className="empty-state" role="alert">
            <h1>Let’s give that another try.</h1>
            <p>
              Something didn’t load correctly. Refresh to reopen your learning
              space. Saved drafts stay in this browser tab.
            </p>
            <button
              className="button primary"
              onClick={() => window.location.reload()}
            >
              Reopen Smarticus
            </button>
          </section>
        </main>
      );
    return this.props.children;
  }
}
