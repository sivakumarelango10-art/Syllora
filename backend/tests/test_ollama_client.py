from app.services.ollama_client import strip_thinking_text


def test_strip_thinking_text_removes_leaked_reasoning_prefix() -> None:
    content = (
        "The model is planning here. </think>\n\n"
        "Deadlock occurs when processes wait on resources held by one another. [S1]"
    )
    assert strip_thinking_text(content) == (
        "Deadlock occurs when processes wait on resources held by one another. [S1]"
    )


def test_strip_thinking_text_removes_a_complete_think_block() -> None:
    content = "<think>private reasoning</think>Final answer."
    assert strip_thinking_text(content) == "Final answer."
