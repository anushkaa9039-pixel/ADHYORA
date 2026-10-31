import { Component, type ReactNode } from 'react';

// If one section crashes, show a message and a way out instead of a blank page.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(e: unknown) { return { error: e instanceof Error ? e.message : String(e) }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="bg-paper px-6 py-10 text-ink" role="alert">
        <p className="mb-2 font-semibold">Something went wrong on this page.</p>
        <p className="mb-4 max-w-[60ch] text-sm text-[#3b4a3b]">{this.state.error}</p>
        <button className="mr-2 rounded-full bg-wine px-5 py-2.5 text-sm font-semibold text-white" onClick={() => this.setState({ error: '' })}>Try again</button>
        <button className="rounded-full border border-sage2 px-4 py-2 text-sm font-semibold" onClick={() => { try { localStorage.removeItem('adh_pick'); localStorage.removeItem('adh_subject'); } catch { /* ignore */ } location.reload(); }}>Clear my class and subject, then reload</button>
      </div>
    );
  }
}
