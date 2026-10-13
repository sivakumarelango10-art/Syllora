from app.rag.search import has_sufficient_evidence, keyword_score, tokenize


def test_tokenize_removes_common_stopwords() -> None:
    assert set(tokenize("What is a deadlock in operating systems?")) == {"deadlock", "operating", "systems"}


def test_keyword_score_detects_matching_terms() -> None:
    terms = set(tokenize("deadlock resources"))
    score = keyword_score(terms, set(tokenize("A deadlock happens when processes wait for resources")),
                         "deadlock resources", "A deadlock happens when processes wait for resources")
    assert score >= 0.99


def test_keyword_score_is_zero_without_overlap() -> None:
    score = keyword_score(set(tokenize("quantum entanglement")),
                          set(tokenize("deadlock and starvation in operating systems")),
                          "quantum entanglement", "deadlock and starvation in operating systems")
    assert score == 0.0


def test_evidence_gate_rejects_quantum_entanglement_from_os_notes() -> None:
    query = "According to my notes, explain quantum entanglement."
    results = [
        {
            "text": "Why a time quantum is important in Round Robin CPU scheduling.",
            "semantic_score": 0.5558,
            "keyword_score": 0.5,
            "score": 0.5435,
        },
        {
            "text": "Deadlock: processes are stuck waiting for one another.",
            "semantic_score": 0.5429,
            "keyword_score": 0.0,
            "score": 0.4235,
        },
    ]
    assert has_sufficient_evidence(query, results) is False


def test_evidence_gate_accepts_a_directly_supported_deadlock_question() -> None:
    query = "According to my notes, what is deadlock?"
    results = [
        {
            "text": "Deadlock: processes are stuck waiting for one another.",
            "semantic_score": 0.5429,
            "keyword_score": 1.0,
            "score": 0.65,
        },
    ]
    assert has_sufficient_evidence(query, results) is True
