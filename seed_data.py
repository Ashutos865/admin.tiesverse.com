import os
import django
import random
from datetime import timedelta
from django.utils import timezone

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from tiesverse_app.models import Department, TeamMember, Event, EventSpeaker, EventRegistration

def create_sample_data():
    print("Clearing old sample data...")
    EventRegistration.objects.all().delete()
    EventSpeaker.objects.all().delete()
    Event.objects.all().delete()
    TeamMember.objects.all().delete()
    Department.objects.all().delete()

    print("Creating Departments...")
    departments_data = [
        {"name": "Research & Policy"},
        {"name": "Technology & AI"},
        {"name": "Public Relations"},
        {"name": "Global Strategy"},
        {"name": "Human Resources"},
    ]
    
    depts = []
    for d in departments_data:
        dept = Department.objects.create(**d)
        depts.append(dept)

    print("Creating Team Members...")
    team_data = [
        {"department": depts[0], "name": "Alice Johnson", "role": "Lead Researcher", "bio": "Expert in AI Ethics.", "photo_url": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=400"},
        {"department": depts[1], "name": "Bob Smith", "role": "CTO", "bio": "20 years of software engineering experience.", "photo_url": "https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=400"},
        {"department": depts[2], "name": "Charlie Davis", "role": "PR Manager", "bio": "Communications specialist.", "photo_url": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=400"},
        {"department": depts[3], "name": "Diana Prince", "role": "Director of Strategy", "bio": "Global operations expert.", "photo_url": "https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=400"},
        {"department": depts[4], "name": "Evan Wright", "role": "HR Lead", "bio": "People operations professional.", "photo_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400"},
    ]

    for t in team_data:
        TeamMember.objects.create(**t)

    print("Creating Events...")
    now = timezone.now()
    events_data = [
        {
            "title": "AI Policy Summit 2026",
            "description": "Annual summit on artificial intelligence regulations.",
            "event_type": "online",
            "status": "upcoming",
            "start_datetime": now + timedelta(days=10),
            "end_datetime": now + timedelta(days=10, hours=8),
            "venue_name": "Virtual",
            "capacity": 500,
            "cover_image_url": "https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=600",
            "is_published": True
        },
        {
            "title": "Global Tech Seminar",
            "description": "Discussing the future of open source tech.",
            "event_type": "offline",
            "status": "upcoming",
            "start_datetime": now + timedelta(days=20),
            "end_datetime": now + timedelta(days=20, hours=2),
            "venue_name": "San Francisco Tech Hub",
            "capacity": 1000,
            "cover_image_url": "https://images.unsplash.com/photo-1591115765373-5207764f72e7?q=80&w=600",
            "is_published": True
        },
        {
            "title": "Local Networking Mixer",
            "description": "Connect with local tech professionals.",
            "event_type": "offline",
            "status": "upcoming",
            "start_datetime": now + timedelta(days=30),
            "end_datetime": now + timedelta(days=30, hours=4),
            "venue_name": "New York City",
            "capacity": 50,
            "cover_image_url": "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?q=80&w=600",
            "is_published": False
        },
        {
            "title": "Cybersecurity Workshop",
            "description": "Hands-on workshop for securing cloud architectures.",
            "event_type": "online",
            "status": "ongoing",
            "start_datetime": now - timedelta(hours=1),
            "end_datetime": now + timedelta(hours=3),
            "venue_name": "Virtual",
            "capacity": 200,
            "cover_image_url": "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=600",
            "is_published": True
        },
        {
            "title": "Future of Governance Forum",
            "description": "Panel discussion on digital governance.",
            "event_type": "online",
            "status": "completed",
            "start_datetime": now - timedelta(days=40),
            "end_datetime": now - timedelta(days=40, hours=6),
            "venue_name": "London & Virtual",
            "capacity": 300,
            "cover_image_url": "https://images.unsplash.com/photo-1582192730841-2a682d7375f9?q=80&w=600",
            "is_published": True
        },
    ]

    events = []
    for e in events_data:
        ev = Event.objects.create(**e)
        events.append(ev)

    print("Creating Event Speakers...")
    speakers_data = [
        {"event": events[0], "name": "Dr. Sarah Connor", "designation": "AI Researcher", "organization": "TechCorp", "bio": "Leading expert in machine learning.", "photo_url": "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?q=80&w=400"},
        {"event": events[0], "name": "John Connor", "designation": "Security Analyst", "organization": "CyberDef", "bio": "Specializes in threat detection.", "photo_url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=400"},
        {"event": events[1], "name": "Ada Lovelace", "designation": "Pioneer", "organization": "History", "bio": "Computer programming pioneer.", "photo_url": "https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=400"},
        {"event": events[3], "name": "Alan Turing", "designation": "Cryptanalyst", "organization": "Gov", "bio": "Cryptography and computing expert.", "photo_url": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=400"},
        {"event": events[4], "name": "Grace Hopper", "designation": "Admiral", "organization": "Navy", "bio": "Inventor of the compiler.", "photo_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=400"},
    ]

    for s in speakers_data:
        EventSpeaker.objects.create(**s)

    print("Creating Event Registrations...")
    regs_data = [
        {"event": events[0], "first_name": "Tom", "last_name": "Hanks", "email": "tom@example.com", "organization": "Hollywood", "status": "confirmed"},
        {"event": events[0], "first_name": "Meryl", "last_name": "Streep", "email": "meryl@example.com", "organization": "Hollywood", "status": "confirmed"},
        {"event": events[1], "first_name": "Denzel", "last_name": "Washington", "email": "denzel@example.com", "organization": "Hollywood", "status": "waitlisted"},
        {"event": events[3], "first_name": "Viola", "last_name": "Davis", "email": "viola@example.com", "organization": "Hollywood", "status": "confirmed"},
        {"event": events[4], "first_name": "Morgan", "last_name": "Freeman", "email": "morgan@example.com", "organization": "Hollywood", "status": "attended"},
    ]

    for r in regs_data:
        EventRegistration.objects.create(**r)

    print("Successfully seeded database with sample data!")

if __name__ == '__main__':
    create_sample_data()
