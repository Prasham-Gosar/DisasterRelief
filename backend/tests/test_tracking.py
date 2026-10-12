from tests.conftest import FLOOD


def test_track_with_correct_phone(client, make_report):
    ref = make_report()["tracking_ref"]
    r = client.get(f"/api/incidents/track/{ref}", params={"phone": "9876543210"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "reported" and body["editable"] is True
    assert body["timeline"][0]["action"] == "create"
    assert "reporter_phone" not in body  # citizen view never leaks contact data


def test_phone_formats_are_accepted(client, make_report):
    ref = make_report()["tracking_ref"]
    assert client.get(f"/api/incidents/track/{ref}", params={"phone": "+91 98765 43210"}).status_code == 200
    assert client.get(f"/api/incidents/track/{ref.lower()}", params={"phone": "9876543210"}).status_code == 200


def test_wrong_phone_is_404_not_403(client, make_report):  # SE-3
    ref = make_report()["tracking_ref"]
    wrong = client.get(f"/api/incidents/track/{ref}", params={"phone": "9999999999"})
    missing_phone = client.get(f"/api/incidents/track/{ref}")
    junk_phone = client.get(f"/api/incidents/track/{ref}", params={"phone": "abc"})
    unknown_ref = client.get("/api/incidents/track/DRR-2026-999999", params={"phone": "9876543210"})
    for r in (wrong, missing_phone, junk_phone, unknown_ref):
        assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"
    # identical message, so nobody can tell "exists with another phone" from "does not exist"
    assert wrong.json() == unknown_ref.json()


def test_citizen_sees_progress_and_rejection_remark(client, coord_headers, make_report):
    ref_data = make_report()
    ref, rid = ref_data["tracking_ref"], ref_data["report_id"]
    client.post(f"/api/incidents/{rid}/verify", headers=coord_headers)
    seen = client.get(f"/api/incidents/track/{ref}", params={"phone": FLOOD["reporter_phone"]}).json()
    assert seen["status"] == "verified" and seen["editable"] is False
    assert [t["action"] for t in seen["timeline"]] == ["create", "verify"]

    other = make_report(latitude=19.5)
    client.post(f"/api/incidents/{other['report_id']}/reject", headers=coord_headers, json={"remark": "Not a real flood"})
    rejected = client.get(f"/api/incidents/track/{other['tracking_ref']}", params={"phone": FLOOD["reporter_phone"]}).json()
    assert rejected["status"] == "closed" and rejected["remark"] == "Not a real flood"
    reject_step = next(t for t in rejected["timeline"] if t["action"] == "reject")
    assert reject_step["remark"] == "Not a real flood"


# ------------------------------------------------- coordinator list + detail
def test_list_requires_coordinator(client, make_report):
    assert client.get("/api/incidents").status_code == 401


def test_list_sorts_critical_first_then_oldest(client, coord_headers, make_report):
    low = make_report(severity="low", latitude=19.10)["report_id"]
    crit_old = make_report(severity="critical", latitude=19.20)["report_id"]
    high = make_report(severity="high", latitude=19.30)["report_id"]
    crit_new = make_report(severity="critical", latitude=19.40)["report_id"]
    items = client.get("/api/incidents", headers=coord_headers).json()["items"]
    assert [i["id"] for i in items] == [crit_old, crit_new, high, low]


def test_finished_reports_sink_below_open_ones(client, coord_headers, make_report):
    rejected = make_report(severity="critical", latitude=19.10)["report_id"]
    client.post(f"/api/incidents/{rejected}/reject", headers=coord_headers, json={"remark": "false alarm here"})
    open_low = make_report(severity="low", latitude=19.20)["report_id"]
    ids = [i["id"] for i in client.get("/api/incidents", headers=coord_headers).json()["items"]]
    assert ids == [open_low, rejected]


def test_list_filters(client, coord_headers, make_report):
    a = make_report(severity="low", latitude=19.10, location="Andheri subway")["report_id"]
    make_report(severity="high", latitude=19.20, location="Bandra bridge")
    make_report(latitude=19.10)  # duplicate of the first
    client.post(f"/api/incidents/{a}/verify", headers=coord_headers)

    def ids(query):
        return [i["id"] for i in client.get(f"/api/incidents?{query}", headers=coord_headers).json()["items"]]

    assert ids("status=verified") == [a]
    assert ids("severity=high") == [2, 3]  # report 3 uses the default severity (high)
    assert ids("q=bandra") == [2]
    assert ids("q=DRR-") != []
    assert len(ids("possible_duplicate=true")) == 1
    assert ids("incident_type=fire") == []
    bad = client.get("/api/incidents?status=weird", headers=coord_headers)
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "VALIDATION_ERROR"


def test_list_pagination_and_age(client, coord_headers, make_report):
    for i in range(5):
        make_report(latitude=19.1 + i)
    r = client.get("/api/incidents?page=2&page_size=2", headers=coord_headers).json()
    assert r["total"] == 5 and r["page"] == 2 and r["page_size"] == 2 and len(r["items"]) == 2
    assert r["items"][0]["age_minutes"] >= 0


def test_detail_has_type_specific_fields_and_photos(client, coord_headers, make_report):
    rid = make_report()["report_id"]
    d = client.get(f"/api/incidents/{rid}", headers=coord_headers).json()
    assert d["type_specific"] == {"water_level": "knee-deep"}
    assert d["reporter_phone"] == "9876543210" and d["reporter_name"] == "Asha"
    assert d["photos"] == [] and d["citizen_subscribed"] is True


def test_detail_requires_login(client, make_report):
    rid = make_report()["report_id"]
    assert client.get(f"/api/incidents/{rid}").status_code == 401
