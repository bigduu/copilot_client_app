use std::{pin::Pin, time::Duration};

use httpmock::MockServer;

use reqwest_sse::{EventSource, JsonEvent, PlainEvent, error::EventError};
use tokio_stream::{Stream, StreamExt};

async fn assert_events(
    stream: &mut Pin<Box<impl Stream<Item = Result<PlainEvent, EventError>>>>,
    expected_events: &[PlainEvent],
) {
    for expected in expected_events {
        let event = stream.next().await;
        println!("Received event: {:?}", event);
        if let Some(event) = event {
            println!("Event: {:?}", event);
            assert_eq!(&event.unwrap(), expected);
        }
    }
}

#[tokio::test]
async fn process_simple_event_stream() {
    let server = MockServer::start_async().await;

    let mock = server
        .mock_async(|when, then| {
            when.method("GET").path("/sse");
            then.status(200)
                .header("content-type", "text/event-stream")
                .body(include_str!("data/simple_event_stream.sse"));
        })
        .await;

    let mut events = reqwest::get(server.url("/sse"))
        .await
        .unwrap()
        .events()
        .await
        .unwrap();

    mock.assert_async().await;

    assert_events(
        &mut events,
        &[
            PlainEvent {
                event_type: "message".to_string(),
                data: "first event".to_string(),
                last_event_id: None,
                retry: None,
            },
            PlainEvent {
                event_type: "message".to_string(),
                data: "second\nevent\nis\nmultiline".to_string(),
                last_event_id: None,
                retry: None,
            },
            PlainEvent {
                event_type: "metadata".to_string(),
                data: "event with custom event type".to_string(),
                last_event_id: None,
                retry: None,
            },
            PlainEvent {
                event_type: "message".to_string(),
                data: "fourth valid event".to_string(),
                last_event_id: Some("empty-event-with-id-and-retry".to_string()),
                retry: Some(Duration::from_millis(12345)),
            },
        ],
    )
    .await;

    assert!(events.next().await.is_none());
}

#[derive(serde::Deserialize, Debug, PartialEq, Eq)]
struct TestData {
    a: bool,
}

#[tokio::test]
async fn process_simple_json_event_stream() {
    let server = MockServer::start_async().await;

    let mock = server
        .mock_async(|when, then| {
            when.method("GET").path("/sse");
            then.status(200)
                .header("content-type", "text/event-stream")
                .body(include_str!("data/simple_json_event_stream.sse"));
        })
        .await;

    let mut events = reqwest::get(server.url("/sse"))
        .await
        .unwrap()
        .events()
        .await
        .unwrap();

    mock.assert_async().await;

    let expected_true = JsonEvent {
        event_type: "message".to_string(),
        data: reqwest_sse::Data::Json(TestData { a: true }),
        last_event_id: None,
        retry: None,
    };

    let expected_false = JsonEvent {
        event_type: "message".to_string(),
        data: reqwest_sse::Data::Json(TestData { a: false }),
        last_event_id: None,
        retry: None,
    };

    for expected_data in &[expected_true, expected_false] {
        let event = events.next().await;
        println!("Received event: {:?}", event);
        if let Some(event) = event {
            let event = event.unwrap().json().unwrap();
            println!("Event: {:?} , expected: {:?}", event, expected_data);
            assert_eq!(&event, expected_data);
        }
    }

    let event = events.next().await.unwrap().unwrap();
    assert_eq!(
        event,
        PlainEvent {
            event_type: "metadata".to_string(),
            data: "event with custom event type".to_string(),
            last_event_id: None,
            retry: None,
        }
    );

    println!("Event: {:?}", event);

    assert!(events.next().await.is_none());
}
