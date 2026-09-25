import { Component } from "react";
import Icon from "./ui/Icon";
import translations from "../i18n/translations";

function pickText(key, fallback) {
  try {
    const lang = document.documentElement.lang || "fa";
    return translations[lang]?.[key] || translations.fa?.[key] || fallback;
  } catch {
    return fallback;
  }
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <span className="error-boundary-icon"><Icon name="alertTriangle" size={30} /></span>
            <h2>{pickText("errorBoundary.title", "Something went wrong")}</h2>
            <p>{this.state.error?.message || pickText("errorBoundary.message", "An unexpected error occurred.")}</p>
            <button
              className="primary-button"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = "/";
              }}
            >
              {pickText("errorBoundary.home", "Go to Home")}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
