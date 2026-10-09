import { Dashboard } from "@/components/dashboard";
import { ToolList } from "@/components/tool-list";
export default function HomePage() {
  return (
    <div className="home-page">
      <header className="home-heading">
        <h1>KunCode Setup</h1>
        <p>配置好，直接开始用。</p>
      </header>
      <Dashboard />
      <section className="home-tools" aria-labelledby="tools-heading">
        <h2 id="tools-heading">Coding Tools</h2>
        <ToolList />
      </section>
    </div>
  );
}
