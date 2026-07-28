# Candidate trawl

**Screened:** 2026-07-26
**Status:** research shortlist, not event ground truth

The trawl stopped at eight candidates: three 311, three dispatch, and two
mixed-source. Final counts and IDs were independently replayed after the agent
screens. Proximity, density, and matching labels remain leads rather than proof
that records describe one incident.

## Recommended eval additions

| Candidate | Shape worth testing | Expected role |
| --- | --- | --- |
| Sweeny/Hale sidewalk sweep | 111 reports move along a roughly 300 m corridor within four hours. | Positive for spatial chaining rather than one fixed point. |
| 3rd/Mendell/Palou response | Six co-located dispatch calls span ShotSpotter, shooting, passing, citation, and an accident. | Positive for one mixed-classification response episode. |
| 830 Market pavement reports | 289 reports recur at an almost clocklike 24 per day for nearly two weeks. | Negative for periodic integration artifacts. |
| Jones/Market on-view batch | Six co-located calls, five of them officer-initiated. | Negative for operational activity that clustering should find but later ranking should penalize. |

## Additional leads

| Candidate | Observation | Why it is not first |
| --- | --- | --- |
| 5048 3rd Street tree reports | 83 reports within roughly 10 by 18 m in one day. | Useful, but similar to existing compact survey-batch fixtures. |
| 6th/Stevenson dispatch burst | Six kinds in 53 minutes; two of six calls were officer-initiated. | Plausible evolving response, but weaker interpretation than 3rd/Mendell/Palou. |
| 26th/Shotwell sidewalk reports | One blocked-sidewalk dispatch followed by two encampment reports within 15 m and 26 minutes. | Strong cross-source linkage lead, but only three points. |
| Duboce/Pearl noise reports | Matching dispatch and 311 noise records within 27 m and 25 minutes. | Strong pair, but too small for the current five-point clustering test. |

## Evidence

### Sweeny/Hale sidewalk sweep

- Window: 2019-07-12 09:46:56–13:41:30.
- 111 `Sidewalk or Curb` reports across roughly 179 by 258 m; 106 were
  collapsed-sidewalk reports.
- No matching rows appeared in the same cell during the surrounding four-week
  control window.
- [Target rows](https://data.sfgov.org/resource/vw6y-z8j6.json?%24select=service_request_id%2Crequested_datetime%2Cclosed_date%2Cstatus_description%2Cservice_name%2Cservice_subtype%2Cservice_details%2Caddress%2Clat%2Clong%2Csource&%24where=requested_datetime+%3E%3D+%272019-07-12T00%3A00%3A00%27+AND+requested_datetime+%3C+%272019-07-13T00%3A00%3A00%27+AND+service_name%3D%27Sidewalk+or+Curb%27+AND+lat+%3E%3D+37.7315+AND+lat+%3C+37.7345+AND+long+%3E%3D+-122.4105+AND+long+%3C+-122.4065&%24order=requested_datetime&%24limit=5000)
  and [temporal control](https://data.sfgov.org/resource/vw6y-z8j6.json?%24select=date_trunc_ymd%28requested_datetime%29+as+day%2Ccount%28*%29+as+cases&%24where=requested_datetime+%3E%3D+%272019-06-28T00%3A00%3A00%27+AND+requested_datetime+%3C+%272019-07-27T00%3A00%3A00%27+AND+service_name%3D%27Sidewalk+or+Curb%27+AND+lat+%3E%3D+37.7315+AND+lat+%3C+37.7345+AND+long+%3E%3D+-122.4105+AND+long+%3C+-122.4065&%24group=date_trunc_ymd%28requested_datetime%29&%24order=day&%24limit=200).

### 3rd/Mendell/Palou response

- Window: 2023-09-01 19:00–20:00.
- Six calls at one masked intersection, including ShotSpotter at 19:25 and a
  shooting call at 19:31; four calls were officer-initiated.
- The prior four matching Fridays had no calls at that location and hour.
- [Target rows](https://data.sfgov.org/resource/2zdj-bwza.json?%24select=cad_number%2Creceived_datetime%2Ccall_type_original_desc%2Ccall_type_final_desc%2Conview_flag%2Cdisposition%2Cagency%2Cintersection_name%2Cintersection_point&%24where=cad_number%20in%28%27232442759%27%2C%27232442782%27%2C%27232442787%27%2C%27232442841%27%2C%27232442861%27%2C%27232442873%27%29&%24order=received_datetime%2Ccad_number)
  and [matched control](https://data.sfgov.org/resource/2zdj-bwza.json?%24select=cad_number%2Creceived_datetime%2Ccall_type_original_desc%2Ccall_type_final_desc%2Conview_flag%2Cdisposition%2Cagency%2Cintersection_name%2Cintersection_point&%24where=intersection_name%3D%2703RD%20ST%20%5C%5C%20MENDELL%20ST%20%5C%5C%20PALOU%20AVE%27%20AND%20%28%28received_datetime%3E%3D%272023-08-04T19%3A00%3A00%27%20AND%20received_datetime%3C%272023-08-04T20%3A00%3A00%27%29%20OR%20%28received_datetime%3E%3D%272023-08-11T19%3A00%3A00%27%20AND%20received_datetime%3C%272023-08-11T20%3A00%3A00%27%29%20OR%20%28received_datetime%3E%3D%272023-08-18T19%3A00%3A00%27%20AND%20received_datetime%3C%272023-08-18T20%3A00%3A00%27%29%20OR%20%28received_datetime%3E%3D%272023-08-25T19%3A00%3A00%27%20AND%20received_datetime%3C%272023-08-25T20%3A00%3A00%27%29%29&%24order=received_datetime%2Ccad_number).

### 830 Market pavement reports

- Window: 2020-02-05 07:49:12 through 2020-02-17 07:25:35.
- 289 unique reports; 288 share the same address, coordinates, and integrated
  agency source.
- Counts held at exactly 24 per day for ten consecutive days, strongly
  suggesting integration output rather than independent defects.
- [Target rows](https://data.sfgov.org/resource/vw6y-z8j6.json?%24select=service_request_id%2Crequested_datetime%2Cclosed_date%2Cstatus_description%2Cservice_name%2Cservice_subtype%2Cservice_details%2Caddress%2Clat%2Clong%2Csource&%24where=requested_datetime+%3E%3D+%272020-02-05T00%3A00%3A00%27+AND+requested_datetime+%3C+%272020-02-18T00%3A00%3A00%27+AND+service_name%3D%27Street+Defects%27+AND+lat+%3E%3D+37.7845+AND+lat+%3C+37.7855+AND+long+%3E%3D+-122.4065+AND+long+%3C+-122.4055&%24order=requested_datetime&%24limit=5000)
  and [daily counts](https://data.sfgov.org/resource/vw6y-z8j6.json?%24select=date_trunc_ymd%28requested_datetime%29+as+day%2Ccount%28*%29+as+cases&%24where=requested_datetime+%3E%3D+%272020-02-01T00%3A00%3A00%27+AND+requested_datetime+%3C+%272020-02-21T00%3A00%3A00%27+AND+service_name%3D%27Street+Defects%27+AND+lat+%3E%3D+37.7845+AND+lat+%3C+37.7855+AND+long+%3E%3D+-122.4065+AND+long+%3C+-122.4055&%24group=date_trunc_ymd%28requested_datetime%29&%24order=day&%24limit=200).

### Jones/Market on-view batch

- Window: 2024-06-09 22:00–23:00.
- Six calls across five kinds; five were officer-initiated.
- The prior four matching Sundays had no calls at that location and hour.
- [Target rows](https://data.sfgov.org/resource/2zdj-bwza.json?%24select=cad_number%2Creceived_datetime%2Ccall_type_original_desc%2Ccall_type_final_desc%2Conview_flag%2Cdisposition%2Cagency%2Cintersection_name%2Cintersection_point&%24where=cad_number%20in%28%27241612776%27%2C%27241612769%27%2C%27241612780%27%2C%27241612782%27%2C%27241612793%27%2C%27241612840%27%29&%24order=received_datetime%2Ccad_number)
  and [matched control](https://data.sfgov.org/resource/2zdj-bwza.json?%24select=cad_number%2Creceived_datetime%2Ccall_type_original_desc%2Ccall_type_final_desc%2Conview_flag%2Cdisposition%2Cagency%2Cintersection_name%2Cintersection_point&%24where=intersection_name%3D%27JONES%20ST%20%5C%5C%20MARKET%20ST%27%20AND%20%28%28received_datetime%3E%3D%272024-05-12T22%3A00%3A00%27%20AND%20received_datetime%3C%272024-05-12T23%3A00%3A00%27%29%20OR%20%28received_datetime%3E%3D%272024-05-19T22%3A00%3A00%27%20AND%20received_datetime%3C%272024-05-19T23%3A00%3A00%27%29%20OR%20%28received_datetime%3E%3D%272024-05-26T22%3A00%3A00%27%20AND%20received_datetime%3C%272024-05-26T23%3A00%3A00%27%29%20OR%20%28received_datetime%3E%3D%272024-06-02T22%3A00%3A00%27%20AND%20received_datetime%3C%272024-06-02T23%3A00%3A00%27%29%29&%24order=received_datetime%2Ccad_number).

### Other candidates

- **5048 3rd Street:** 83 tree-maintenance reports on 2021-12-13 within
  roughly 10 by 18 m. [Target rows](https://data.sfgov.org/resource/vw6y-z8j6.json?%24select=service_request_id%2Crequested_datetime%2Cclosed_date%2Cstatus_description%2Cservice_name%2Cservice_subtype%2Cservice_details%2Caddress%2Clat%2Clong%2Csource&%24where=requested_datetime+%3E%3D+%272021-12-13T00%3A00%3A00%27+AND+requested_datetime+%3C+%272021-12-14T00%3A00%3A00%27+AND+service_name%3D%27Tree+Maintenance%27+AND+lat+%3E%3D+37.7325+AND+lat+%3C+37.7335+AND+long+%3E%3D+-122.3925+AND+long+%3C+-122.3915&%24order=requested_datetime&%24limit=5000).
- **6th/Stevenson:** six dispatch calls across six kinds in 53 minutes; two
  were officer-initiated. [Target rows](https://data.sfgov.org/resource/2zdj-bwza.json?%24select=cad_number%2Creceived_datetime%2Ccall_type_original_desc%2Ccall_type_final_desc%2Conview_flag%2Cdisposition%2Cagency%2Cintersection_name%2Cintersection_point&%24where=cad_number%20in%28%27243292401%27%2C%27243292426%27%2C%27243292454%27%2C%27243292488%27%2C%27243292510%27%2C%27243292561%27%29&%24order=received_datetime%2Ccad_number).
- **26th/Shotwell:** dispatch `250341969` and 311 cases `101001412967`,
  `101001413021`. [311 rows](https://data.sfgov.org/resource/vw6y-z8j6.json?%24select=service_request_id%2Crequested_datetime%2Cservice_name%2Clat%2Clong&%24where=service_request_id%20in%28%27101001412967%27%2C%27101001413021%27%29&%24order=requested_datetime%2Cservice_request_id)
  and [dispatch row](https://data.sfgov.org/resource/2zdj-bwza.json?%24select=cad_number%2Creceived_datetime%2Ccall_type_original_desc%2Cintersection_name%2Cintersection_point&%24where=cad_number%3D%27250341969%27).
- **Duboce/Pearl:** dispatch `251612387` and 311 case `101002070751`.
  [311 row](https://data.sfgov.org/resource/vw6y-z8j6.json?%24select=service_request_id%2Crequested_datetime%2Cservice_name%2Clat%2Clong&%24where=service_request_id%3D%27101002070751%27)
  and [dispatch row](https://data.sfgov.org/resource/2zdj-bwza.json?%24select=cad_number%2Creceived_datetime%2Ccall_type_original_desc%2Cintersection_name%2Cintersection_point&%24where=cad_number%3D%27251612387%27).
