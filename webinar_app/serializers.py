from rest_framework import serializers
from .models import EventFormSection, WebinarEvent, RegistrationForm, CalendarEvent, EventFormQuestion

class WebinarEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = WebinarEvent
        fields = '__all__'

class RegistrationFormSerializer(serializers.ModelSerializer):
    class Meta:
        model = RegistrationForm
        fields = '__all__'

class CalendarEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = CalendarEvent
        fields = '__all__'

class EventFormQuestionSerializer(serializers.ModelSerializer):
    # Surfaced so the builder can show which questions are permanent without
    # having to know the rule itself.
    is_locked = serializers.BooleanField(read_only=True)

    class Meta:
        model = EventFormQuestion
        fields = '__all__'


class EventFormSectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventFormSection
        fields = '__all__'
